# tests/test_env_loader.py — unit tests for env_loader.py
#
# What this file does: verifies that load_project_env() correctly aliases
# NEXT_PUBLIC_SUPABASE_URL -> SUPABASE_URL when SUPABASE_URL is absent.
# What it must never do: actually read from .env files (we patch load_dotenv).

import os
import pytest
from unittest.mock import patch, MagicMock
import importlib


class TestLoadProjectEnv:
    def test_supabase_url_set_from_next_public_fallback(self):
        """If SUPABASE_URL is absent but NEXT_PUBLIC_SUPABASE_URL exists,
        load_project_env should copy the value across."""
        env_patch = {
            "NEXT_PUBLIC_SUPABASE_URL": "https://test.supabase.co",
        }
        # Remove SUPABASE_URL if present so the fallback branch runs
        env_before = os.environ.pop("SUPABASE_URL", None)
        try:
            with patch("dotenv.load_dotenv"):  # don't actually read .env files
                with patch.dict(os.environ, env_patch, clear=False):
                    import env_loader
                    env_loader.load_project_env()
                    assert os.environ.get("SUPABASE_URL") == "https://test.supabase.co"
        finally:
            if env_before is not None:
                os.environ["SUPABASE_URL"] = env_before
            else:
                os.environ.pop("SUPABASE_URL", None)

    def test_supabase_url_not_overwritten_when_already_set(self):
        """If SUPABASE_URL is already set, load_project_env must not change it."""
        original = "https://already-set.supabase.co"
        env_patch = {
            "SUPABASE_URL": original,
            "NEXT_PUBLIC_SUPABASE_URL": "https://different.supabase.co",
        }
        with patch("dotenv.load_dotenv"):
            with patch.dict(os.environ, env_patch, clear=False):
                import env_loader
                env_loader.load_project_env()
                assert os.environ["SUPABASE_URL"] == original

    def test_load_project_env_does_not_raise_without_env_files(self):
        """load_project_env should not raise even when .env / .env.local are absent."""
        with patch("dotenv.load_dotenv"):
            import env_loader
            env_loader.load_project_env()   # should complete without error
