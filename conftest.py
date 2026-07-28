# conftest.py — pytest configuration for the Onekey backend test suite.
#
# Purpose: set environment variables and sys.path BEFORE any test module is imported.
# This must live at the project root (next to router.py, crypto.py etc.) so that
# `from router import ...` works without installing the package.
#
# Why env vars here? If you set them inside a test file, Python may have already
# imported the module that reads them (e.g. crypto.py reads MASTER_SECRET on first call).
# conftest.py runs first, before any imports happen in test files.

import os
import sys

# Make sure the project root is on the path so `from router import ...` works
sys.path.insert(0, os.path.dirname(__file__))

# Throwaway secrets — never use these values outside tests
os.environ.setdefault("MASTER_SECRET", "test-secret-for-unit-tests-only")

# Use in-memory SQLite so tests never touch the real onekey.db
# (router.py doesn't use the DB directly, but modules it imports might)
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
