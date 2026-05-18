#!/usr/bin/env python3
# logging.py - Unified logging for dev-flow commands
#
# Provides plain text console output functions used across all commands.

import sys


def log_info(msg: str) -> None:
    print(f"[INFO] {msg}")


def log_success(msg: str) -> None:
    print(f"[OK] {msg}")


def log_error(msg: str, file=None) -> None:
    print(f"[ERROR] {msg}", file=file or sys.stderr)


def log_warn(msg: str) -> None:
    print(f"[WARN] {msg}")


def log_step(msg: str) -> None:
    print(f"[STEP] {msg}")
