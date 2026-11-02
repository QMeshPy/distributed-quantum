"""Export recorded finance evidence without changing its JSON number types."""

from typing import Any

from fastapi import HTTPException, Response

from quantum_backend_v2.provenance.hashing import canonical_json


def finance_provenance_download(result: dict[str, Any]) -> Response:
    provenance = result.get("provenance")
    if not provenance:
        raise HTTPException(404, "Recorded price evidence is not available for this job.")
    return Response(
        content=canonical_json(provenance),
        media_type="application/json",
        headers={
            "Content-Disposition": 'attachment; filename="price-provenance.json"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
