# IPFS Setup Guide for Research Results Storage

This guide walks you through setting up IPFS via Web3.Storage for decentralized storage of research results in the Quantum Backend system.

## Overview

**What is IPFS?**
- InterPlanetary File System: Content-addressed, peer-to-peer hypermedia protocol
- Files are identified by their content (CID), not location
- Perfect for immutable research results that need permanent, verifiable storage

**Why Web3.Storage?**
- Free tier: 5GB storage (plenty for research results)
- Simple HTTP API (no local IPFS node required)
- Built-in pinning service (keeps your content available)
- Public gateway URLs for easy access

**Use Case in Phase 4:**
- Research results uploaded to IPFS after completion
- Content-addressable by CID (Content Identifier)
- Publicly verifiable and permanently stored
- Gateway URLs provided for easy viewing

---

## Step 1: Sign Up for Web3.Storage

1. **Visit the signup page**
   ```
   https://web3.storage/login
   ```

2. **Create your account**
   - Sign in with **Email** or **GitHub**
   - Verify your email if prompted
   - No payment information required for free tier

3. **Confirm account activation**
   - Check your email for verification link
   - Click to activate account

---

## Step 2: Generate API Token

1. **Navigate to API Tokens**
   - After logging in, go to **Account** section
   - Click **Create API Token** or **New Token**

2. **Create the token**
   - Give it a descriptive name: `Quantum Backend - Research Results`
   - Click **Create**

3. **Copy the token**
   - Token format: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - **IMPORTANT:** Copy immediately - it won't be shown again
   - Store securely in your password manager

---

## Step 3: Configure Environment Variables

1. **Open your `.env` file**
   ```bash
   cd /path/to/backend
   nano .env  # or use your preferred editor
   ```

2. **Add the Web3.Storage API key**
   ```bash
   # IPFS / Decentralized Storage (Web3.Storage)
   WEB3_STORAGE_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your_actual_token_here
   ```

3. **Save and close** the file

4. **Verify the configuration**
   ```bash
   # Check that the key is set (don't print full value for security)
   grep WEB3_STORAGE_API_KEY .env
   ```

---

## Step 4: Test IPFS Upload

We've provided a test script to verify your IPFS integration is working correctly.

### Test Script: `test_ipfs_upload.py`

Save this as `/backend/scripts/test_ipfs_upload.py`:

```python
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
```

### Running the Test Script

1. **Make the script executable**
   ```bash
   chmod +x scripts/test_ipfs_upload.py
   ```

2. **Run the test**
   ```bash
   # From the backend directory
   python scripts/test_ipfs_upload.py
   ```

3. **Expected output**
   ```
   ============================================================
   IPFS Integration Test Suite
   ============================================================

   === Testing Gateway URL Generation ===
   ✓ Gateway URL generated correctly:
     https://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi.ipfs.w3s.link

   === Testing JSON Upload to IPFS ===
   ✓ IPFSService initialized successfully
   Uploading test research results to IPFS...
   ✓ Upload successful!
     CID: bafybeiabc123...
     Gateway URL: https://bafybeiabc123....ipfs.w3s.link

   === Testing File Upload to IPFS ===
   Created test file: /tmp/quantum_test_result.txt
   Uploading test file to IPFS...
   ✓ File upload successful!
     CID: bafybeiabc456...
     Gateway URL: https://bafybeiabc456....ipfs.w3s.link

   ============================================================
   Test Summary
   ============================================================
   3/3 tests passed
   ✓ All tests passed! IPFS integration is working correctly.
   ```

---

## Step 5: Integration with Proposal Service

The `IPFSService` is already integrated into the proposal service. Here's how it works:

### Automatic Upload on Result Submission

```python
from utils.ipfs import get_ipfs_service

# In proposal_service.py
async def submit_results(proposal_id: str, fragment_id: str, results: dict):
    """Submit research results and upload to IPFS."""
    
    # Upload results to IPFS
    ipfs_service = get_ipfs_service()
    ipfs_metadata = await ipfs_service.upload_research_results(results)
    
    # Store CID and gateway URL in MongoDB
    await proposals_collection.update_one(
        {"_id": proposal_id, "fragments.id": fragment_id},
        {
            "$set": {
                "fragments.$.results": results,
                "fragments.$.ipfs_cid": ipfs_metadata["cid"],
                "fragments.$.ipfs_url": ipfs_metadata["url"],
                "fragments.$.status": "completed"
            }
        }
    )
```

### API Endpoint Usage

**POST /api/proposals/{proposal_id}/fragments/{fragment_id}/results**

```json
{
  "results": {
    "algorithm": "Quantum Teleportation",
    "fidelity": 0.9845,
    "measurements": [...],
    "circuit": "OPENQASM 2.0; ..."
  }
}
```

**Response:**

```json
{
  "message": "Results submitted and uploaded to IPFS",
  "ipfs_cid": "bafybeiabc123...",
  "ipfs_url": "https://bafybeiabc123....ipfs.w3s.link",
  "fragment_id": "frag_67890",
  "status": "completed"
}
```

---

## Troubleshooting

### Error: "Web3.Storage API key is required"

**Cause:** Environment variable not set or `.env` file not loaded

**Solution:**
1. Verify `WEB3_STORAGE_API_KEY` exists in `.env`
2. Restart the backend server to reload environment
3. Check for typos in variable name

### Error: "HTTP 401 Unauthorized"

**Cause:** Invalid or expired API token

**Solution:**
1. Generate a new token at https://web3.storage
2. Update `.env` with the new token
3. Restart the server

### Error: "Upload timeout" or "Network error"

**Cause:** Network connectivity issues or Web3.Storage downtime

**Solution:**
1. Check your internet connection
2. Verify Web3.Storage status: https://status.web3.storage
3. Try again in a few minutes
4. Check firewall settings (port 443 must be open)

### Error: "5GB storage limit exceeded"

**Cause:** Free tier storage limit reached

**Solution:**
1. Delete old uploads via Web3.Storage dashboard
2. Upgrade to paid plan for more storage
3. Implement cleanup strategy for old research results

---

## Storage Best Practices

### 1. Content Optimization
- Compress large datasets before upload
- Use efficient JSON serialization
- Remove unnecessary metadata

### 2. CID Management
- Always store CIDs in your database
- CIDs are permanent - content cannot be edited
- Use CIDs for verification and deduplication

### 3. Gateway URLs
- Gateway URLs are for viewing, not storage
- Multiple gateways can serve the same CID
- Default gateway: `https://{cid}.ipfs.w3s.link`

### 4. Rate Limiting
- Web3.Storage has rate limits on free tier
- Batch uploads when possible
- Implement retry logic with exponential backoff

---

## Next Steps

1. ✓ Sign up for Web3.Storage account
2. ✓ Generate and configure API token
3. ✓ Run test script to verify integration
4. ✓ IPFS automatically used by proposal service
5. Start submitting real research results!

---

## Resources

- **Web3.Storage Documentation**: https://web3.storage/docs/
- **IPFS Documentation**: https://docs.ipfs.tech/
- **CID Inspector**: https://cid.ipfs.tech/
- **Public Gateway Checker**: https://ipfs.github.io/public-gateway-checker/

---

## Support

If you encounter issues:

1. Check Web3.Storage status: https://status.web3.storage
2. Review Web3.Storage docs: https://web3.storage/docs/
3. Test with curl:
   ```bash
   curl -X POST https://api.web3.storage/upload \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"test": "data"}'
   ```

---

**Setup completed!** Your IPFS integration is ready for decentralized research result storage.
