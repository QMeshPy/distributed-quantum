#!/bin/bash
# Test Caddy CORS configuration for multiple origins

echo "=========================================="
echo "Testing Caddy CORS Configuration"
echo "=========================================="
echo ""

API_URL="https://api.distributed-quantum.com/api/v1/pharma/submit"

# Test 1: www origin
echo "✓ Testing www.distributed-quantum.com..."
response=$(curl -s -I -X OPTIONS \
  -H "Origin: https://www.distributed-quantum.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  "$API_URL")

www_origin=$(echo "$response" | grep -i "access-control-allow-origin:" | tr -d '\r')
if [[ "$www_origin" == *"https://www.distributed-quantum.com"* ]]; then
    echo "  ✅ PASS: $www_origin"
else
    echo "  ❌ FAIL: Expected 'https://www.distributed-quantum.com', got:"
    echo "  $www_origin"
fi
echo ""

# Test 2: non-www origin
echo "✓ Testing distributed-quantum.com (no www)..."
response=$(curl -s -I -X OPTIONS \
  -H "Origin: https://distributed-quantum.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  "$API_URL")

non_www_origin=$(echo "$response" | grep -i "access-control-allow-origin:" | tr -d '\r')
if [[ "$non_www_origin" == *"https://distributed-quantum.com"* ]] && [[ "$non_www_origin" != *"www"* ]]; then
    echo "  ✅ PASS: $non_www_origin"
else
    echo "  ❌ FAIL: Expected 'https://distributed-quantum.com', got:"
    echo "  $non_www_origin"
fi
echo ""

# Test 3: Check that returned origin matches requested origin
echo "✓ Verifying origin reflection (returned = requested)..."
if [[ "$www_origin" == *"www.distributed-quantum.com"* ]] && \
   [[ "$non_www_origin" == *"distributed-quantum.com"* ]] && \
   [[ "$non_www_origin" != *"www"* ]]; then
    echo "  ✅ PASS: Each origin correctly reflected back"
else
    echo "  ❌ FAIL: Origins not properly reflected"
fi
echo ""

# Test 4: Check credentials header
echo "✓ Checking Access-Control-Allow-Credentials..."
credentials=$(echo "$response" | grep -i "access-control-allow-credentials:" | tr -d '\r')
if [[ "$credentials" == *"true"* ]]; then
    echo "  ✅ PASS: $credentials"
else
    echo "  ❌ FAIL: Credentials not set to true"
    echo "  $credentials"
fi
echo ""

echo "=========================================="
echo "Summary"
echo "=========================================="
echo "If all tests passed, CORS is working correctly."
echo "Your frontend can now call the API from both:"
echo "  - https://www.distributed-quantum.com"
echo "  - https://distributed-quantum.com"
echo ""
