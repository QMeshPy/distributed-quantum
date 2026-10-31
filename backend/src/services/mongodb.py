"""MongoDB connection settings shared with the core API."""

from quantum_backend_v2.config import load_settings


def mongodb_connection_settings(
    uri: str | None = None, database: str | None = None
) -> tuple[str, str]:
    settings = load_settings().persistence.mongodb
    uri = uri or settings.effective_uri
    if not uri:
        variable = f"QB2_MONGODB_{settings.target.value.upper()}_URI"
        raise ValueError(f"{variable} is required for MongoDB-backed services")
    return uri, database or settings.database
