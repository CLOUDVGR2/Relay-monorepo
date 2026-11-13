"""Shared PostgreSQL TLS configuration for the AI API and recording worker."""

from __future__ import annotations

import os
import ssl
from collections.abc import Mapping
from pathlib import Path
from typing import Any


def database_connect_args(
    environ: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    """Build asyncpg connection arguments from explicit TLS settings."""
    settings = os.environ if environ is None else environ
    mode = settings.get("DATABASE_SSL_MODE", "disable").strip().lower()
    ca_path = settings.get("DATABASE_SSL_CA_CERT", "").strip()

    if mode == "disable":
        if ca_path:
            raise ValueError(
                "DATABASE_SSL_CA_CERT requires DATABASE_SSL_MODE=verify-full"
            )
        return {}

    if mode != "verify-full":
        raise ValueError(
            "DATABASE_SSL_MODE must be either 'disable' or 'verify-full'"
        )

    if ca_path and not Path(ca_path).is_file():
        raise ValueError("DATABASE_SSL_CA_CERT must point to an existing CA file")

    try:
        context = ssl.create_default_context(cafile=ca_path or None)
    except (OSError, ssl.SSLError) as exc:
        raise ValueError("Unable to load the PostgreSQL TLS CA certificate") from exc

    context.check_hostname = True
    context.verify_mode = ssl.CERT_REQUIRED
    return {"ssl": context}
