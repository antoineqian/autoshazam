import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

DEFAULT_LISTEN_PORT = 2234
DEFAULT_DOWNLOAD_DIR = "./downloads"

# Credentials live in backend/.env so that starting the app stays a plain
# `./dev.sh`, with no secrets on the command line or in shell history. The
# path is resolved from this file rather than the working directory, so the
# smoke script and uvicorn both find it wherever they are started from.
ENV_FILE = Path(__file__).resolve().parents[3] / ".env"

_env_file_loaded = False


def ensure_env_file_loaded(path: Path = ENV_FILE) -> None:
    """Read the .env file once, leaving any variable already set alone.

    Real environment variables win, so Docker Compose and CI keep passing
    values in the usual way without a stray file overriding them.
    """
    global _env_file_loaded
    if _env_file_loaded:
        return
    load_dotenv(path, override=False)
    _env_file_loaded = True


@dataclass(frozen=True)
class SoulseekConfig:
    account: str
    password: str
    listen_port: int
    download_dir: Path


def load_config(env: dict[str, str] | None = None) -> SoulseekConfig | None:
    """Read the Soulseek settings from the environment.

    Returns ``None`` when no account is configured, which disables the feature
    instead of failing at startup: the analysis side of the app has no reason
    to need a Soulseek account.
    """
    if env is None:
        ensure_env_file_loaded()
        env = os.environ

    account = env.get("SOULSEEK_ACCOUNT")
    password = env.get("SOULSEEK_PASSWORD")
    if not account or password is None:
        return None

    return SoulseekConfig(
        account=account,
        password=password,
        listen_port=int(env.get("SOULSEEK_LISTEN_PORT") or DEFAULT_LISTEN_PORT),
        download_dir=Path(env.get("SOULSEEK_DOWNLOAD_DIR") or DEFAULT_DOWNLOAD_DIR),
    )
