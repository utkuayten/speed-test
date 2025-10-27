# app.py (better)
from flask import Flask, render_template, request, jsonify, send_file, make_response
import os, io

app = Flask(__name__)

# Pre-generate test files at startup (25MB and 100MB)
TEST_DIR = "testdata"; os.makedirs(TEST_DIR, exist_ok=True)
def ensure_file(path, size_mb):
    if not os.path.exists(path) or os.path.getsize(path) != size_mb*1024*1024:
        with open(path, "wb") as f: f.write(os.urandom(size_mb*1024*1024))

ensure_file(os.path.join(TEST_DIR, "25mb.bin"), 25)
ensure_file(os.path.join(TEST_DIR, "100mb.bin"), 100)

def no_cache(resp):
    resp.headers["Cache-Control"] = "no-store"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    resp.headers["Content-Encoding"] = "identity"
    return resp

@app.route("/")
def index(): return render_template("index.html")

@app.route("/ping")
def ping():
    # No artificial sleep. Server just answers.
    return no_cache(jsonify(ok=True))

@app.route("/download")
def download():
    size = request.args.get("size", "25")  # "25" or "100"
    path = os.path.join(TEST_DIR, f"{size}mb.bin")
    resp = make_response(send_file(path, mimetype="application/octet-stream", as_attachment=False, download_name="test.bin"))
    return no_cache(resp)

@app.route("/upload", methods=["POST"])
def upload():
    # Accessing request.stream will pull the body; we don't store it.
    total = 0
    for chunk in request.stream: total += len(chunk)
    return no_cache(jsonify(received_bytes=total))

if __name__ == "__main__":
    app.run(debug=False, threaded=True)
