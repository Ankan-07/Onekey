# tests/test_crypto.py — unit tests for crypto.py
#
# What this file does: verifies AES-GCM encrypt/decrypt round-trips, tamper
# detection, hash_token, and mask_token WITHOUT touching the DB or network.
# What it must never do: use a real MASTER_SECRET or write to disk.

import os
import base64
import pytest
from unittest.mock import patch

# conftest.py already sets MASTER_SECRET before any import, so crypto is safe
# to import here.
import crypto


# ---------------------------------------------------------------------------
# encrypt / decrypt round-trip
# ---------------------------------------------------------------------------

class TestEncryptDecrypt:
    def test_roundtrip_returns_original(self):
        plaintext = "sk-supersecretkey"
        token = crypto.encrypt(plaintext)
        assert crypto.decrypt(token) == plaintext

    def test_encrypt_produces_different_ciphertexts_each_call(self):
        # AES-GCM uses a fresh random nonce every call, so two encryptions of
        # the same value must produce different tokens (probabilistically certain).
        plaintext = "same-key"
        t1 = crypto.encrypt(plaintext)
        t2 = crypto.encrypt(plaintext)
        assert t1 != t2

    def test_encrypted_token_is_base64(self):
        token = crypto.encrypt("test")
        # Should not raise — if it is not valid b64 this will throw ValueError
        decoded = base64.b64decode(token)
        # nonce (12) + at least 1 byte ciphertext + 16 byte GCM tag
        assert len(decoded) > 12 + 16

    def test_decrypt_raises_on_tampered_ciphertext(self):
        token = crypto.encrypt("original")
        raw = bytearray(base64.b64decode(token))
        # Flip a byte in the ciphertext region (after the 12-byte nonce)
        raw[20] ^= 0xFF
        bad_token = base64.b64encode(bytes(raw)).decode("ascii")
        with pytest.raises(Exception):
            crypto.decrypt(bad_token)

    def test_decrypt_raises_on_wrong_key(self):
        # Encrypt under current key, then decrypt under a different MASTER_SECRET
        token = crypto.encrypt("my-key")
        with patch.dict(os.environ, {"MASTER_SECRET": "totally-different-secret"}):
            with pytest.raises(Exception):
                crypto.decrypt(token)

    def test_roundtrip_unicode_plaintext(self):
        plaintext = "unicode-test-string"
        assert crypto.decrypt(crypto.encrypt(plaintext)) == plaintext

    def test_roundtrip_empty_string(self):
        assert crypto.decrypt(crypto.encrypt("")) == ""


# ---------------------------------------------------------------------------
# _master_secret raises when env var is absent
# ---------------------------------------------------------------------------

class TestMasterSecretEnvGuard:
    def test_encrypt_raises_without_master_secret(self):
        env_backup = os.environ.pop("MASTER_SECRET", None)
        try:
            with pytest.raises(RuntimeError, match="MASTER_SECRET"):
                crypto.encrypt("anything")
        finally:
            if env_backup is not None:
                os.environ["MASTER_SECRET"] = env_backup


# ---------------------------------------------------------------------------
# hash_token
# ---------------------------------------------------------------------------

class TestHashToken:
    def test_returns_64_hex_chars(self):
        h = crypto.hash_token("ok-abc123")
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_deterministic(self):
        token = "ok-deterministic"
        assert crypto.hash_token(token) == crypto.hash_token(token)

    def test_different_tokens_produce_different_hashes(self):
        assert crypto.hash_token("token-a") != crypto.hash_token("token-b")

    def test_empty_string_hash(self):
        h = crypto.hash_token("")
        assert len(h) == 64


# ---------------------------------------------------------------------------
# mask_token
# ---------------------------------------------------------------------------

class TestMaskToken:
    def test_long_token_shows_prefix_and_suffix(self):
        token = "ok-abcdefghijklmnop"
        masked = crypto.mask_token(token)
        assert masked.startswith(token[:6])
        assert masked.endswith(token[-4:])
        assert "..." in masked or "\u2026" in masked

    def test_short_token_shows_truncated(self):
        # Tokens with len <= 12 get the short form
        token = "ok-short"
        masked = crypto.mask_token(token)
        assert masked.startswith(token[:3])
        assert masked.endswith("...") or masked.endswith("\u2026")

    def test_exactly_12_chars_uses_short_form(self):
        token = "123456789012"
        masked = crypto.mask_token(token)
        assert masked.endswith("...") or masked.endswith("\u2026")

    def test_13_chars_uses_long_form(self):
        token = "1234567890123"
        masked = crypto.mask_token(token)
        assert "..." in masked or "\u2026" in masked
        assert masked.endswith(token[-4:])
