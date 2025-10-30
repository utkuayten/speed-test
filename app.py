from flask import Flask, request, Response, jsonify, send_from_directory
import os

app = Flask(__name__, static_folder=".", static_url_path="")

# === Test file settings ===
FILE_PATH = os.path.abspath("internet_file.bin")
CHUNK_SIZE = 64 * 1024  # 64 KiB

def ensure_test_file():
    """Create a random file if missing."""
    if not os.path.exists(FILE_PATH):
        print("Creating test file (250 MB)...")
        with open(FILE_PATH, "wb") as f:
            f.write(os.urandom(250 * 1024 * 1024))  # 250 MB
ensure_test_file()

# === Serve static files (HTML, JS, CSS) ===
@app.route("/")
def index():
    return send_from_directory("../../../Downloads", "index.html")

@app.route("/<path:path>")
def static_files(path):
    # Serve style.css, download.js, etc.
    if os.path.exists(path):
        return send_from_directory("../../../Downloads", path)
    return Response("Not Found", status=404)

# === Metadata ===
@app.route("/meta")
def meta():
    size = os.path.getsize(FILE_PATH)
    name = os.path.basename(FILE_PATH)
    return jsonify({"name": name, "size": size})

# === File stream ===
def read_file_range(path, start, end):
    with open(path, "rb") as f:
        f.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            chunk = f.read(min(CHUNK_SIZE, remaining))
            if not chunk:
                break
            yield chunk
            remaining -= len(chunk)

@app.route("/internet-file")
def internet_file():
    if not os.path.exists(FILE_PATH):
        return Response("File not found", status=404)

    file_size = os.path.getsize(FILE_PATH)
    range_header = request.headers.get("Range")

    if not range_header:
        return Response(
            read_file_range(FILE_PATH, 0, file_size - 1),
            status=200,
            mimetype="application/octet-stream",
            headers={
                "Content-Length": str(file_size),
                "Accept-Ranges": "bytes",
                "Cache-Control": "no-store",
            },
        )

    try:
        units, rng = range_header.split("=")
        if units.strip().lower() != "bytes":
            return Response(status=416)
        start_str, end_str = rng.split("-")
        start = int(start_str) if start_str else 0
        end = int(end_str) if end_str else file_size - 1
        start = max(0, start)
        end = min(end, file_size - 1)
        if start > end:
            return Response(status=416)
    except Exception:
        return Response(status=416)

    length = end - start + 1
    resp = Response(
        read_file_range(FILE_PATH, start, end),
        status=206,
        mimetype="application/octet-stream",
        headers={
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(length),
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-store",
        },
    )
    return resp

@app.route("/ping")
def ping():
    return {"status": "ok", "port": 5001}

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001, threaded=True)
