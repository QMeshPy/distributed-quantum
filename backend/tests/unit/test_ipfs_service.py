"""Pinata uploads use the configured credential type and response contract."""

import json

import httpx
import pytest

from utils.ipfs import IPFSService, IPFSUploadError

pytestmark = pytest.mark.anyio


@pytest.fixture
def pinata_http(monkeypatch):
    for key in ("PINATA_JWT", "PINATA_API_KEY", "PINATA_API_SECRET"):
        monkeypatch.delenv(key, raising=False)
    requests = []
    response = {"status": 200, "json": {"IpfsHash": "QmTestHash"}}

    def handle(request):
        requests.append(request)
        return httpx.Response(response["status"], json=response["json"])

    factory = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kwargs: factory(transport=httpx.MockTransport(handle), **kwargs),
    )
    return requests, response


@pytest.mark.parametrize("method", ["json", "file"])
@pytest.mark.parametrize("jwt", [True, False])
async def test_pinata_uploads(pinata_http, tmp_path, method, jwt):
    requests, _ = pinata_http
    service = IPFSService(jwt="test-jwt") if jwt else IPFSService(
        api_key="test-key", api_secret="test-secret"
    )
    if method == "json":
        assert await service.upload_json({"result": 42}) == "QmTestHash"
    else:
        path = tmp_path / "result.txt"
        path.write_text("research result")
        assert await service.upload_file(str(path)) == "QmTestHash"
    request, = requests
    endpoint = "pinJSONToIPFS" if method == "json" else "pinFileToIPFS"
    assert str(request.url) == f"https://api.pinata.cloud/pinning/{endpoint}"
    if jwt:
        assert request.headers["Authorization"] == "Bearer test-jwt"
        assert "pinata_api_key" not in request.headers
    else:
        assert request.headers["pinata_api_key"] == "test-key"
        assert request.headers["pinata_secret_api_key"] == "test-secret"
        assert "Authorization" not in request.headers
    if method == "json":
        assert json.loads(request.content) == {"pinataContent": {"result": 42}}
    else:
        assert b'research result' in request.content
        assert 'multipart/form-data; boundary=' in request.headers["Content-Type"]
    assert service.get_gateway_url("ipfs://QmTestHash") == (
        "https://gateway.pinata.cloud/ipfs/QmTestHash"
    )


@pytest.mark.parametrize("result", [{}, {"IpfsHash": ""}, {"IpfsHash": None}])
async def test_pinata_missing_cid_fails(pinata_http, result):
    _, response = pinata_http
    response["json"] = result
    with pytest.raises(IPFSUploadError, match="CID"):
        await IPFSService(jwt="test-jwt").upload_json({"result": 42})


async def test_pinata_http_error_is_wrapped(pinata_http):
    _, response = pinata_http
    response["status"] = 401
    response["json"] = {"error": "invalid credentials"}
    with pytest.raises(IPFSUploadError, match="401"):
        await IPFSService(jwt="test-jwt").upload_json({"result": 42})
