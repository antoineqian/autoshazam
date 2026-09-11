"""HTTP surface for Soulseek downloads. Job state lives in the backend
process; the frontend polls it and records finished downloads itself."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from ..infra.soulseek.config import load_config
from ..infra.soulseek.jobs import DownloadManager, Item, Job, JobError
from ..infra.soulseek.matching import ALLOWED_FORMATS, Preferences, Scored

router = APIRouter(prefix="/soulseek", tags=["soulseek"])

_manager: DownloadManager | None = None


def get_manager() -> DownloadManager:
    global _manager
    if _manager is None:
        config = load_config()
        if config is None:
            raise HTTPException(status_code=503, detail="Soulseek is not configured")
        # Imported here so a backend without credentials never loads aioslsk.
        from ..infra.soulseek.aioslsk_transport import AioslskTransport

        transport = AioslskTransport(config)
        _manager = DownloadManager(
            transport, config.download_dir, incoming_dir=transport.incoming_dir
        )
    return _manager


async def shutdown_manager() -> None:
    global _manager
    if _manager is not None:
        await _manager.shutdown()
        _manager = None


# ------------------------------------------------------------- schemas --


class PreferencesIn(BaseModel):
    formatPriority: list[str] = ["flac", "mp3"]
    minMp3Bitrate: int | None = 320
    autoDownload: bool = True

    @field_validator("formatPriority")
    @classmethod
    def _formats(cls, value: list[str]) -> list[str]:
        lowered = [v.lower() for v in value]
        if not lowered:
            raise ValueError("at least one format is required")
        unknown = [v for v in lowered if v not in ALLOWED_FORMATS]
        if unknown:
            raise ValueError(f"unknown formats: {', '.join(unknown)}")
        if len(set(lowered)) != len(lowered):
            raise ValueError("formats must not repeat")
        return lowered

    def to_preferences(self) -> Preferences:
        return Preferences(
            format_priority=tuple(self.formatPriority),
            min_mp3_bitrate=self.minMp3Bitrate,
            auto_download=self.autoDownload,
        )


class ItemIn(BaseModel):
    title: str = Field(min_length=1)
    subtitle: str = Field(min_length=1)
    sourceLabel: str = "Unknown source"


class CreateJobIn(BaseModel):
    preferences: PreferencesIn = PreferencesIn()
    items: list[ItemIn] = Field(min_length=1)


class ChooseIn(BaseModel):
    username: str
    remotePath: str


# ---------------------------------------------------------- serialisers --


def serialize_candidate(scored: Scored) -> dict:
    c = scored.candidate
    return {
        "username": c.username,
        "remotePath": c.remote_path,
        "filename": c.filename,
        "folder": c.folder,
        "extension": c.extension,
        "filesize": c.filesize,
        "bitrate": c.bitrate,
        "duration": c.duration,
        "vbr": c.vbr,
        "sampleRate": c.sample_rate,
        "bitDepth": c.bit_depth,
        "hasFreeSlots": c.has_free_slots,
        "avgSpeed": c.avg_speed,
        "queueSize": c.queue_size,
        "matchScore": scored.match,
    }


def serialize_item(item: Item) -> dict:
    return {
        "id": item.id,
        "title": item.title,
        "subtitle": item.subtitle,
        "sourceLabel": item.source_label,
        "status": item.status,
        "queryUsed": item.query_used,
        "progress": item.progress,
        "localPath": item.local_path,
        "error": item.error,
        "attempts": item.attempts,
        "candidates": [serialize_candidate(s) for s in item.candidates] if item.status == "review" else [],
        "chosen": serialize_candidate(item.chosen) if item.chosen else None,
    }


def serialize_job(job: Job) -> dict:
    return {
        "id": job.id,
        "createdAt": job.created_at.isoformat(),
        "items": [serialize_item(i) for i in job.items],
    }


# ------------------------------------------------------------- routes --


@router.get("/status")
async def status() -> dict:
    configured = load_config() is not None
    connected = bool(_manager is not None and getattr(_manager._transport, "connected", False))
    return {"configured": configured, "connected": connected}


@router.post("/jobs", status_code=201)
async def create_job(body: CreateJobIn) -> dict:
    manager = get_manager()
    job = manager.create_job(
        body.preferences.to_preferences(),
        [(i.title, i.subtitle, i.sourceLabel) for i in body.items],
    )
    return serialize_job(job)


@router.get("/jobs/{job_id}")
async def read_job(job_id: str) -> dict:
    job = get_manager().get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return serialize_job(job)


def _item_action(job_id: str, item_id: str, action) -> dict:
    try:
        return serialize_item(action(get_manager(), job_id, item_id))
    except KeyError:
        raise HTTPException(status_code=404, detail="Job or item not found")
    except JobError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.post("/jobs/{job_id}/items/{item_id}/choose")
async def choose(job_id: str, item_id: str, body: ChooseIn) -> dict:
    return _item_action(
        job_id, item_id, lambda m, j, i: m.choose(j, i, body.username, body.remotePath)
    )


@router.post("/jobs/{job_id}/items/{item_id}/skip")
async def skip(job_id: str, item_id: str) -> dict:
    return _item_action(job_id, item_id, lambda m, j, i: m.skip(j, i))


@router.post("/jobs/{job_id}/items/{item_id}/retry")
async def retry(job_id: str, item_id: str) -> dict:
    return _item_action(job_id, item_id, lambda m, j, i: m.retry(j, i))
