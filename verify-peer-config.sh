#!/bin/bash
# Diagnostic script to verify peer configuration at each layer

echo "=========================================="
echo "LAYER 1: Root .env file (Docker Compose)"
echo "=========================================="
grep "QB2_LIBP2P_DEV_SERVICE_PEER_COUNT" .env || echo "❌ NOT FOUND in root .env"
echo ""

echo "=========================================="
echo "LAYER 2: Docker Container Environment"
echo "=========================================="
docker compose exec backend env | grep "QB2_LIBP2P_DEV_SERVICE_PEER_COUNT" || echo "❌ NOT SET in container"
echo ""

echo "=========================================="
echo "LAYER 3: Application Logs (Peer Spawning)"
echo "=========================================="
echo "Looking for 'started X embedded libp2p worker peers' message..."
docker compose logs backend | grep -i "embedded libp2p worker" | tail -5
echo ""

echo "=========================================="
echo "LAYER 4: Active Peers in Discovery Service"
echo "=========================================="
echo "Checking /api/v1/peers endpoint..."
curl -s http://localhost:8080/api/v1/peers | python3 -m json.tool | grep -E "(peer_id|count)" | head -20
echo ""

echo "=========================================="
echo "Expected Result:"
echo "  - Root .env: QB2_LIBP2P_DEV_SERVICE_PEER_COUNT=4"
echo "  - Container env: QB2_LIBP2P_DEV_SERVICE_PEER_COUNT=4"
echo "  - Logs: 'started 4 embedded libp2p worker peers'"
echo "  - API: 5 total peers (1 coordinator + 4 workers)"
echo "=========================================="
