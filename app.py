from flask import Flask, send_file, jsonify, request, make_response
from flask_cors import CORS
import argparse
import os
import time

app = Flask(__name__)
CORS(app)
FILE_PATH = "/home/utku_ayten/speed-test/static/internet_file.bin"


# ===========================================================
# 🌐 CORS for all routes
# ===========================================================
@app.after_request
def add_cors_headers(resp):
    """Attach CORS headers globally (for Range and Upload)."""
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, HEAD, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Range, Origin, Content-Type, Accept"
    resp.headers["Access-Control-Expose-Headers"] = "Content-Length, Content-Range, Accept-Ranges"
    resp.headers["Cache-Control"] = "no-store"
    return resp


# ===========================================================
# 📏 Metadata endpoint
# ===========================================================
@app.route("/meta")
def meta():
    if not os.path.exists(FILE_PATH):
        return jsonify({"error": "File not found"}), 404
    size = os.path.getsize(FILE_PATH)
    return jsonify({"name": os.path.basename(FILE_PATH), "size": size})


# ===========================================================
# 📥 Download file with Range support
# ===========================================================
@app.route("/internet-file", methods=["GET", "HEAD", "OPTIONS"])
def internet_file():
    """Serve binary file with Range and OPTIONS support."""
    if request.method == "OPTIONS":
        return make_response(("", 204))

    if not os.path.exists(FILE_PATH):
        return jsonify({"error": "File not found"}), 404

    range_header = request.headers.get("Range")
    file_size = os.path.getsize(FILE_PATH)

    if range_header:
        try:
            byte_range = range_header.strip().split("=")[1]
            start, end = byte_range.split("-")
            start = int(start)
            end = int(end) if end else file_size - 1
            end = min(end, file_size - 1)
        except Exception:
            start, end = 0, file_size - 1

        length = end - start + 1
        with open(FILE_PATH, "rb") as f:
            f.seek(start)
            data = f.read(length)

        response = make_response(data)
        response.status_code = 206
        response.headers["Content-Type"] = "application/octet-stream"
        response.headers["Accept-Ranges"] = "bytes"
        response.headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
        response.headers["Content-Length"] = str(length)
        response.headers["Cache-Control"] = "no-store"
        return response

    response = send_file(FILE_PATH, as_attachment=False)
    response.headers["Accept-Ranges"] = "bytes"
    response.headers["Cache-Control"] = "no-store"
    return response


# ===========================================================
# 📤 Upload endpoint (for upload test)
# ===========================================================
@app.route("/upload", methods=["POST", "OPTIONS"])
def upload():
    """Receive uploaded data and discard it (for speed testing)."""
    if request.method == "OPTIONS":
        return make_response(("", 204))

    # Consume incoming data without saving
    data = request.get_data(cache=False, as_text=False)
    size = len(data) if data else 0
    print(f"📥 Received chunk: {size} bytes")
    return ("", 200)



# ===========================================================
# 🚀 Entry point
# ===========================================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Multi-port Flask server for speed test (upload + download)")
    parser.add_argument("--port", type=int, required=True, help="Port number to bind")
    args = parser.parse_args()

    app.run(host="0.0.0.0", port=args.port, threaded=True)
