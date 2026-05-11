#!/bin/bash
# Verify there are NO duplicate CORS headers

echo "=========================================="
echo "Checking for Duplicate CORS Headers"
echo "=========================================="
echo ""

API_URL="https://api.distributed-quantum.com/api/v1/pharma/submit"

echo "Testing www.distributed-quantum.com..."
response=$(curl -s -I -X OPTIONS \
  -H "Origin: https://www.distributed-quantum.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  "$API_URL")

# Count how many times the header appears
count=$(echo "$response" | grep -i "^access-control-allow-origin:" | wc -l | tr -d ' ')

echo "Response headers:"
echo "$response" | grep -i "access-control"
echo ""

if [ "$count" -eq 1 ]; then
    echo "✅ PASS: Exactly ONE Access-Control-Allow-Origin header"
    origin_value=$(echo "$response" | grep -i "^access-control-allow-origin:" | cut -d: -f2- | tr -d '\r' | xargs)
    echo "   Value: $origin_value"

    if [[ "$origin_value" == "https://www.distributed-quantum.com" ]]; then
        echo "   ✅ Origin matches request!"
    else
        echo "   ❌ Origin doesn't match! Expected: https://www.distributed-quantum.com"
    fi
elif [ "$count" -gt 1 ]; then
    echo "❌ FAIL: Found $count Access-Control-Allow-Origin headers (DUPLICATE!)"
    echo "   Browsers will reject this response."
else
    echo "❌ FAIL: No Access-Control-Allow-Origin header found"
fi

echo ""
echo "=========================================="
echo "If you see '✅ PASS: Exactly ONE', CORS is working correctly!"
echo "=========================================="
