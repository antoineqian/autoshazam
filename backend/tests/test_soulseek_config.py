from pathlib import Path

from backend.src.infra.soulseek import config as config_module
from backend.src.infra.soulseek.config import (
    DEFAULT_DOWNLOAD_DIR,
    DEFAULT_LISTEN_PORT,
    ensure_env_file_loaded,
    load_config,
)

FULL_ENV = {
    "SOULSEEK_ACCOUNT": "someone",
    "SOULSEEK_PASSWORD": "secret",
    "SOULSEEK_LISTEN_PORT": "5555",
    "SOULSEEK_DOWNLOAD_DIR": "/tmp/music",
}


def test_reads_every_setting():
    config = load_config(FULL_ENV)
    assert config is not None
    assert config.account == "someone"
    assert config.password == "secret"
    assert config.listen_port == 5555
    assert config.download_dir == Path("/tmp/music")


def test_defaults_for_the_optional_settings():
    config = load_config({"SOULSEEK_ACCOUNT": "someone", "SOULSEEK_PASSWORD": "s"})
    assert config is not None
    assert config.listen_port == DEFAULT_LISTEN_PORT
    assert config.download_dir == Path(DEFAULT_DOWNLOAD_DIR)


def test_blank_optional_settings_fall_back_to_the_defaults():
    # Compose passes "${SOULSEEK_LISTEN_PORT:-}" as an empty string rather than
    # leaving it unset, which must not blow up on int("").
    config = load_config(
        {**FULL_ENV, "SOULSEEK_LISTEN_PORT": "", "SOULSEEK_DOWNLOAD_DIR": ""}
    )
    assert config is not None
    assert config.listen_port == DEFAULT_LISTEN_PORT
    assert config.download_dir == Path(DEFAULT_DOWNLOAD_DIR)


def test_no_account_disables_the_feature():
    assert load_config({}) is None
    assert load_config({"SOULSEEK_ACCOUNT": ""}) is None
    assert load_config({"SOULSEEK_ACCOUNT": "someone"}) is None  # no password


def test_empty_password_is_still_configured():
    # A blank password is a bad password, not an absent account; failing to log
    # in says more than silently hiding the feature.
    assert load_config({"SOULSEEK_ACCOUNT": "someone", "SOULSEEK_PASSWORD": ""}) is not None


class TestEnvFile:
    def test_fills_in_missing_variables(self, tmp_path, monkeypatch):
        env_file = tmp_path / ".env"
        env_file.write_text("SOULSEEK_ACCOUNT=from_file\nSOULSEEK_PASSWORD=filepass\n")
        monkeypatch.delenv("SOULSEEK_ACCOUNT", raising=False)
        monkeypatch.delenv("SOULSEEK_PASSWORD", raising=False)
        monkeypatch.setattr(config_module, "_env_file_loaded", False)

        ensure_env_file_loaded(env_file)

        config = load_config()
        assert config is not None
        assert config.account == "from_file"

    def test_does_not_override_a_real_environment_variable(self, tmp_path, monkeypatch):
        env_file = tmp_path / ".env"
        env_file.write_text("SOULSEEK_ACCOUNT=from_file\n")
        monkeypatch.setenv("SOULSEEK_ACCOUNT", "from_environment")
        monkeypatch.setattr(config_module, "_env_file_loaded", False)

        ensure_env_file_loaded(env_file)

        assert load_config().account == "from_environment"

    def test_a_missing_file_is_not_an_error(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config_module, "_env_file_loaded", False)
        ensure_env_file_loaded(tmp_path / "nope.env")

    def test_the_file_is_read_only_once(self, tmp_path, monkeypatch):
        env_file = tmp_path / ".env"
        env_file.write_text("SOULSEEK_ACCOUNT=first\n")
        monkeypatch.delenv("SOULSEEK_ACCOUNT", raising=False)
        monkeypatch.setattr(config_module, "_env_file_loaded", False)
        ensure_env_file_loaded(env_file)

        env_file.write_text("SOULSEEK_ACCOUNT=second\n")
        ensure_env_file_loaded(env_file)

        assert load_config().account == "first"
