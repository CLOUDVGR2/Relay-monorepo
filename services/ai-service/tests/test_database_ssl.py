import ssl

import pytest

from app.db.ssl import database_connect_args


def test_database_tls_defaults_to_local_compatible_mode():
    assert database_connect_args({}) == {}


def test_database_tls_can_be_disabled():
    assert database_connect_args({"DATABASE_SSL_MODE": "disable"}) == {}


def test_database_tls_rejects_unknown_modes():
    with pytest.raises(ValueError, match="DATABASE_SSL_MODE"):
        database_connect_args({"DATABASE_SSL_MODE": "require"})


def test_database_tls_rejects_ca_when_disabled():
    with pytest.raises(ValueError, match="requires DATABASE_SSL_MODE"):
        database_connect_args({
            "DATABASE_SSL_MODE": "disable",
            "DATABASE_SSL_CA_CERT": "/tmp/postgres-ca.pem",
        })


def test_database_tls_requires_existing_ca_file(tmp_path):
    with pytest.raises(ValueError, match="existing CA file"):
        database_connect_args({
            "DATABASE_SSL_MODE": "verify-full",
            "DATABASE_SSL_CA_CERT": str(tmp_path / "missing.pem"),
        })


def test_database_tls_uses_certificate_and_hostname_verification():
    context = database_connect_args({
        "DATABASE_SSL_MODE": "verify-full",
    })["ssl"]

    assert isinstance(context, ssl.SSLContext)
    assert context.check_hostname is True
    assert context.verify_mode == ssl.CERT_REQUIRED
