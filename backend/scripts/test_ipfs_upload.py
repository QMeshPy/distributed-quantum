#!/usr/bin/env python3
"""
Test script for IPFS integration via Web3.Storage.
Verifies that the IPFSService can upload and retrieve content.
"""

import asyncio
import sys
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from utils.ipfs import IPFSService, IPFSError


async def test_json_upload():
    """Test uploading JSON data to IPFS."""
    print("\n=== Testing JSON Upload to IPFS ===\n")

    try:
        # Initialize service (reads WEB3_STORAGE_API_KEY from environment)
        service = IPFSService()
        print("✓ IPFSService initialized successfully")

        # Sample research results
        test_data = {
            "research_id": "test-quantum-teleportation-001",
            "algorithm": "Quantum Teleportation",
            "timestamp": "2026-05-20T10:00:00Z",
            "results": {
                "fidelity": 0.9845,
                "gate_count": 12,
                "circuit_depth": 4,
                "success_rate": 0.98
            },
            "metadata": {
                "researcher": "test_user",
                "proposal_id": "prop_12345",
                "fragment_id": "frag_67890"
            }
        }

        print("Uploading test research results to IPFS...")
        metadata = await service.upload_research_results(test_data)

        print(f"\n✓ Upload successful!")
        print(f"  CID: {metadata['cid']}")
        print(f"  Gateway URL: {metadata['url']}")
        print(f"\n📝 You can view the content at: {metadata['url']}")

        return True

    except ValueError as e:
        print(f"\n✗ Configuration error: {e}")
        print("\nMake sure WEB3_STORAGE_API_KEY is set in your .env file")
        return False

    except IPFSError as e:
        print(f"\n✗ IPFS upload failed: {e}")
        return False

    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_file_upload():
    """Test uploading a file to IPFS."""
    print("\n=== Testing File Upload to IPFS ===\n")

    try:
        service = IPFSService()

        # Create a temporary test file
        test_file = Path("/tmp/quantum_test_result.txt")
        test_content = """
Quantum Circuit Execution Results
==================================
Date: 2026-05-20
Algorithm: Shor's Algorithm
Input: N = 15

Results:
- Period found: r = 4
- Factors: 3, 5
- Success: True
- Fidelity: 0.9876
"""
        test_file.write_text(test_content)
        print(f"Created test file: {test_file}")

        print("Uploading test file to IPFS...")
        cid = await service.upload_file(str(test_file))
        url = service.get_gateway_url(cid)

        print(f"\n✓ File upload successful!")
        print(f"  CID: {cid}")
        print(f"  Gateway URL: {url}")
        print(f"\n📝 You can view the file at: {url}")

        # Clean up
        test_file.unlink()

        return True

    except Exception as e:
        print(f"\n✗ File upload test failed: {e}")
        return False


async def test_gateway_url_generation():
    """Test gateway URL generation."""
    print("\n=== Testing Gateway URL Generation ===\n")

    try:
        service = IPFSService()

        # Test with sample CID
        test_cid = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
        url = service.get_gateway_url(test_cid)

        expected = f"https://{test_cid}.ipfs.w3s.link"

        if url == expected:
            print(f"✓ Gateway URL generated correctly:")
            print(f"  {url}")
            return True
        else:
            print(f"✗ Gateway URL mismatch:")
            print(f"  Expected: {expected}")
            print(f"  Got: {url}")
            return False

    except Exception as e:
        print(f"\n✗ Gateway URL test failed: {e}")
        return False


async def main():
    """Run all IPFS tests."""
    print("=" * 60)
    print("IPFS Integration Test Suite")
    print("=" * 60)

    results = []

    # Test 1: Gateway URL generation (no API call)
    results.append(await test_gateway_url_generation())

    # Test 2: JSON upload (requires API key)
    results.append(await test_json_upload())

    # Test 3: File upload (requires API key)
    results.append(await test_file_upload())

    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    passed = sum(results)
    total = len(results)
    print(f"\n{passed}/{total} tests passed")

    if passed == total:
        print("\n✓ All tests passed! IPFS integration is working correctly.")
        return 0
    else:
        print("\n✗ Some tests failed. Check the error messages above.")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
