#!/bin/bash
set -e

# Activate environment
source venv/bin/activate

echo "🧹 Killing old servers (8080, 8081, 8082)..."
pkill -f "server.py" 2>/dev/null || true
pkill -f "app.py" 2>/dev/null || true

sleep 1

echo ""
echo "🚀 Starting servers..."

echo ""
echo "▶️  Starting HTTP server on :8080"
python3 app.py --port=8080 &

sleep 1

echo ""
echo "▶️  Starting HTTP server on :8081"
python3 app.py --port=8081 &

sleep 1

echo ""
echo "🌐 Starting WebSocket server on :8082"
python3 app.py --port=8082 &

sleep 1

echo ""
echo "========================================"
echo "✅ Running Servers Listening on Ports"
echo "========================================"
sudo lsof -iTCP -sTCP:LISTEN -nP | grep -E "8080|8081|8082" || echo "⚠️ None detected"

echo ""
echo "📡 Servers are running. Press CTRL+C to stop."
wait
