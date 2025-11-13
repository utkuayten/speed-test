#!/bin/bash
source venv/bin/activate

echo "🧹 Killing old Flask servers..."
pkill -f server.py 2>/dev/null

echo "🚀 Starting lightweight Flask servers..."
nohup python3 server.py --port=8080  > logs/flask_8080.log 2>&1 &
sleep 1
nohup python3 server.py --port=8081  > logs/flask_8081.log 2>&1 &

sleep 2
echo "✅ Running servers:"
sudo lsof -iTCP -sTCP:LISTEN -nP | grep 808 || echo "⚠️ None detected"
