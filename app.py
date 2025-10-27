# server.py
from flask import Flask, Response, request
import os

app = Flask(__name__)

@app.route("/download")
def download():
    size = int(request.args.get("size", 1024 * 1000 * 2))  # default 1 MB
    data = os.urandom(size)
    return Response(data, mimetype="application/octet-stream")

@app.route("/")
def index():
    return open("index.html").read()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, threaded=True)
