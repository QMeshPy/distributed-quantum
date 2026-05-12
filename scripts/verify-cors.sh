#!/bin/bash
# CORS verification script - tests CORS headers for all configured origins

echo "=========================================="
echo "CORS Configuration Verification"
echo "=========================================="
echo ""

echo "1. Checking root .env configuration..."
grep "CORS_ORIGINS" .env || echo "❌ CORS_ORIGINS not found in .env"
echo ""

echo "2. Checking Docker container environment..."
docker compose exec backend env | grep "CORS_ORIGINS" || echo "❌ CORS_ORIGINS not set in container"
echo ""

echo "3. Testing CORS preflight for each origin..."
echo ""

# Array of origins to test
declare -a origins=(
    "https://distributed-quantum.com"
    "https://www.distributed-quantum.com"
    "http://localhost:3000"
)

for origin in "${origins[@]}"; do
    echo "Testing origin: $origin"
    echo "---"

    # Test preflight (OPTIONS request)
    response=$(curl -s -I -X OPTIONS \
        -H "Origin: $origin" \
        -H "Access-Control-Request-Method: POST" \
        -H "Access-Control-Request-Headers: Content-Type" \
        https://api.distributed-quantum.com/api/v1/pharma/submit 2>&1)

    # Check if Access-Control-Allow-Origin is present
    if echo "$response" | grep -i "access-control-allow-origin: $origin" > /dev/null; then
        echo "✅ CORS allowed for $origin"
    else
        echo "❌ CORS NOT allowed for $origin"
        echo "Response headers:"
        echo "$response" | grep -i "access-control"
    fi
    echo ""
done

echo "=========================================="
echo "4. Testing actual API endpoint..."
echo "=========================================="
curl -s -X OPTIONS \
    -H "Origin: https://www.distributed-quantum.com" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: Content-Type" \
    -i \
    https://api.distributed-quantum.com/api/v1/pharma/submit | head -20
echo ""

echo "=========================================="
echo "Expected Result:"
echo "  - .env contains: CORS_ORIGINS=https://distributed-quantum.com,https://www.distributed-quantum.com,..."
echo "  - Container env: CORS_ORIGINS is set with all domains"
echo "  - Preflight test: access-control-allow-origin matches requested origin"
echo "  - All origins: ✅ CORS allowed"
echo "=========================================="
