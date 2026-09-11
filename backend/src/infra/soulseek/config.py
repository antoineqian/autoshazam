import os
from dataclasses import dataclass
from pathlib import Path

DEFAULT_LISTEN_PORT = 2234
DEFAULT_DOWNLOAD_DIR = "./downloads"


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
    env = os.environ if env is None else env
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
