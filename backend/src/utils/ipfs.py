"""
IPFS utility for uploading research results to Web3.Storage.

This module provides functionality to upload data and files to IPFS
via the Web3.Storage service and retrieve gateway URLs.
"""

import os
import json
import httpx
from typing import Optional
from pathlib import Path


class IPFSError(Exception):
    """Base exception for IPFS operations."""
    pass


class IPFSUploadError(IPFSError):
    """Raised when upload to IPFS fails."""
    pass


class IPFSService:
    """
    Service for interacting with IPFS via Web3.Storage.

    Provides methods to upload JSON data and files to IPFS,
    and generate public gateway URLs for accessing the content.
    """

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize IPFS service.

        Args:
            api_key: Web3.Storage API key. If not provided, reads from
                    WEB3_STORAGE_API_KEY environment variable.

        Raises:
            ValueError: If API key is not provided and not found in environment.
        """
        self.api_key = api_key or os.getenv('WEB3_STORAGE_API_KEY')
        if not self.api_key:
            raise ValueError(
                "Web3.Storage API key is required. "
                "Provide it via constructor or WEB3_STORAGE_API_KEY environment variable."
            )

        self.upload_url = "https://api.web3.storage/upload"
        self.gateway_base = "https://{cid}.ipfs.w3s.link"

    async def upload_json(self, data: dict) -> str:
        """
        Upload JSON data to IPFS via Web3.Storage.

        Args:
            data: Dictionary to upload as JSON.

        Returns:
            IPFS Content Identifier (CID) of the uploaded data.

        Raises:
            IPFSUploadError: If upload fails.
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self.upload_url,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json=data
                )

                response.raise_for_status()
                result = response.json()

                if "cid" not in result:
                    raise IPFSUploadError(
                        f"Upload succeeded but no CID in response: {result}"
                    )

                return result["cid"]

        except httpx.HTTPStatusError as e:
            raise IPFSUploadError(
                f"HTTP error during upload: {e.response.status_code} - {e.response.text}"
            ) from e
        except httpx.RequestError as e:
            raise IPFSUploadError(
                f"Network error during upload: {str(e)}"
            ) from e
        except json.JSONDecodeError as e:
            raise IPFSUploadError(
                f"Invalid JSON response from Web3.Storage: {str(e)}"
            ) from e
        except Exception as e:
            raise IPFSUploadError(
                f"Unexpected error during JSON upload: {str(e)}"
            ) from e

    async def upload_file(self, file_path: str) -> str:
        """
        Upload a file to IPFS via Web3.Storage.

        Args:
            file_path: Path to the file to upload.

        Returns:
            IPFS Content Identifier (CID) of the uploaded file.

        Raises:
            FileNotFoundError: If file does not exist.
            IPFSUploadError: If upload fails.
        """
        path = Path(file_path)

        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        if not path.is_file():
            raise ValueError(f"Path is not a file: {file_path}")

        try:
            # Read file content
            with open(path, 'rb') as f:
                file_content = f.read()

            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    self.upload_url,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                    },
                    files={
                        "file": (path.name, file_content)
                    }
                )

                response.raise_for_status()
                result = response.json()

                if "cid" not in result:
                    raise IPFSUploadError(
                        f"Upload succeeded but no CID in response: {result}"
                    )

                return result["cid"]

        except httpx.HTTPStatusError as e:
            raise IPFSUploadError(
                f"HTTP error during file upload: {e.response.status_code} - {e.response.text}"
            ) from e
        except httpx.RequestError as e:
            raise IPFSUploadError(
                f"Network error during file upload: {str(e)}"
            ) from e
        except json.JSONDecodeError as e:
            raise IPFSUploadError(
                f"Invalid JSON response from Web3.Storage: {str(e)}"
            ) from e
        except OSError as e:
            raise IPFSUploadError(
                f"Error reading file {file_path}: {str(e)}"
            ) from e
        except Exception as e:
            raise IPFSUploadError(
                f"Unexpected error during file upload: {str(e)}"
            ) from e

    def get_gateway_url(self, ipfs_hash: str) -> str:
        """
        Generate a public gateway URL for an IPFS hash.

        Args:
            ipfs_hash: IPFS Content Identifier (CID).

        Returns:
            Public gateway URL for accessing the content.

        Example:
            >>> service = IPFSService()
            >>> url = service.get_gateway_url("bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")
            >>> print(url)
            https://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi.ipfs.w3s.link
        """
        if not ipfs_hash:
            raise ValueError("IPFS hash cannot be empty")

        # Clean the hash (remove ipfs:// prefix if present)
        clean_hash = ipfs_hash.replace("ipfs://", "")

        return self.gateway_base.format(cid=clean_hash)

    async def upload_research_results(self, results: dict) -> dict:
        """
        Upload research results to IPFS and return metadata.

        Convenience method that uploads research results and returns
        both the CID and gateway URL.

        Args:
            results: Research results dictionary to upload.

        Returns:
            Dictionary with 'cid' and 'url' keys.

        Example:
            >>> service = IPFSService()
            >>> metadata = await service.upload_research_results({
            ...     "algorithm": "Quantum Teleportation",
            ...     "results": [...],
            ...     "timestamp": "2026-05-20T10:00:00Z"
            ... })
            >>> print(metadata)
            {
                'cid': 'bafybeigdyrzt...',
                'url': 'https://bafybeigdyrzt....ipfs.w3s.link'
            }
        """
        cid = await self.upload_json(results)
        url = self.get_gateway_url(cid)

        return {
            "cid": cid,
            "url": url
        }


# Singleton instance for convenience
_ipfs_service: Optional[IPFSService] = None


def get_ipfs_service() -> IPFSService:
    """
    Get or create singleton IPFS service instance.

    Returns:
        Shared IPFSService instance.

    Raises:
        ValueError: If API key is not configured.
    """
    global _ipfs_service

    if _ipfs_service is None:
        _ipfs_service = IPFSService()

    return _ipfs_service
