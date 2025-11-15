from flask import Flask, send_file, jsonify, request, make_response, Response
from flask_cors import CORS
from flask_sock import Sock
import argparse
import os
import time
import json
import eventlet
import eventlet.wsgi

app = Flask(__name__)
CORS(app)
sock = Sock(app)

FILE_PATH = "/home/utku_ayten/speed-test/static/internet_file.bin"


# ----------------------------------------------------------
# Global CORS
# ----------------------------------------------------------
@app.after_request
def add_cors_headers(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, HEAD"
    resp.headers["Access-Control-Allow-Headers"] = "Range, Content-Type, Origin, Accept"
    resp.headers["Access-Control-Expose-Headers"] = "Content-Length, Content-Range, Accept-Ranges"
    resp.headers["Cache-Control"] = "no-store"
    return resp


# ----------------------------------------------------------
# /ping  — Latency RTT
# ----------------------------------------------------------
@app.route("/ping", methods=["GET", "HEAD"])
def ping():
    return ("pong", 200)


# ----------------------------------------------------------
# /ws-upload — WebSocket Upload
# ----------------------------------------------------------
@sock.route('/ws-upload')
def ws_upload(ws):
    print("⚡ WS upload client connected")

    last_t = time.time()

    while True:
        try:
            data = ws.receive()
            if data is None:
                print("❌ WS disconnected")
                break

            now = time.time()
            dt = now - last_t
            last_t = now
            size = len(data)

            # Compute Mbps on the server side (optional for debugging)
            mbps = (size * 8) / dt / 1e6 if dt > 0 else 0
            print(f"RECV {size} bytes dt={dt:.4f}s rate={mbps:.2f} Mbps")

            # ACK — tell client to send next frame
            ws.send(json.dumps({
                "bytes": size,
                "dt": dt
            }))

        except Exception as e:
            print("❌ WS ERROR:", e)
            break

    print("🔌 WS upload closed")


# ----------------------------------------------------------
# /meta — Download file info
# ----------------------------------------------------------
@app.route("/meta")
def meta():
    if not os.path.exists(FILE_PATH):
        return jsonify({"error": "File missing"}), 404

    size = os.path.getsize(FILE_PATH)
    return jsonify({
        "name": os.path.basename(FILE_PATH),
        "size": size
    })


# ----------------------------------------------------------
# /internet-file (Range Download)
# ----------------------------------------------------------
@app.route("/internet-file", methods=["GET", "HEAD", "OPTIONS"])
def internet_file():
    if request.method == "OPTIONS":
        return ("", 204)

    if not os.path.exists(FILE_PATH):
        return jsonify({"error": "File missing"}), 404

    file_size = os.path.getsize(FILE_PATH)
    range_header = request.headers.get("Range")

    # RANGE request
    if range_header:
        try:
            _, rng = range_header.split("=")
            start_str, end_str = rng.split("-")
            start = int(start_str)
            end = int(end_str) if end_str else file_size - 1
        except:
            start, end = 0, file_size - 1

        end = min(end, file_size - 1)
        length = end - start + 1

        def generate():
            with open(FILE_PATH, "rb") as f:
                f.seek(start)
                remaining = length
                chunk = 256 * 1024
                while remaining > 0:
                    block = f.read(min(chunk, remaining))
                    if not block:
                        break
                    remaining -= len(block)
                    yield block

        resp = Response(generate(), status=206)
        resp.headers["Content-Type"] = "application/octet-stream"
        resp.headers["Accept-Ranges"] = "bytes"
        resp.headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
        resp.headers["Content-Length"] = str(length)
        return resp

    # NORMAL download
    resp = send_file(FILE_PATH, as_attachment=False)
    resp.headers["Accept-Ranges"] = "bytes"
    return resp


# ----------------------------------------------------------
# HTTP Upload (fallback)
# ----------------------------------------------------------
@app.route("/upload", methods=["POST", "OPTIONS"])
def upload():
    if request.method == "OPTIONS":
        return ("", 204)

    total = 0
    for chunk in request.stream:
        total += len(chunk)

    print(f"📥 HTTP Upload received: {total/1024/1024:.2f} MB")

    resp = make_response("", 200)
    resp.headers["Content-Length"] = "0"
    resp.headers["Connection"] = "keep-alive"
    return resp


# ----------------------------------------------------------
# Entry — Eventlet WebSocket Server
# ----------------------------------------------------------
# ----------------------------------------------------------
# Entry Point
# ----------------------------------------------------------
if __name__ == "__main__":
    import eventlet
    import eventlet.wsgi

    parser = argparse.ArgumentParser(description="Speed test Flask node")
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()

    print(f"🚀 WebSocket-enabled server starting on port {args.port}")

    eventlet.wsgi.server(
        eventlet.listen(("0.0.0.0", args.port)),
        app,
        log_output=True
    )
