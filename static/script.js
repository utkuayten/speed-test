// static/script.js (more accurate)
async function runTests() {
  const results = document.getElementById("results");
  results.innerHTML = "Running…";

  // --- PING (round trip) ---
  const t0 = performance.now();
  await fetch("/ping", { cache: "no-store" });
  const ping = (performance.now() - t0).toFixed(2);

  // --- DOWNLOAD (stream + count bytes) ---
  const dlStart = performance.now();
  const dlRes = await fetch("/download?size=100", { cache: "no-store" });
  const reader = dlRes.body.getReader();
  let dlBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    dlBytes += value.byteLength;
  }
  const dlSecs = (performance.now() - dlStart) / 1000;
  const dlMbps = (dlBytes * 8) / 1_000_000 / dlSecs;

  // --- UPLOAD (bigger body) ---
  const upBody = new Uint8Array(10 * 1024 * 1024); // 10MB
  const ulStart = performance.now();
  await fetch("/upload", { method: "POST", body: upBody, cache: "no-store" });
  const ulSecs = (performance.now() - ulStart) / 1000;
  const ulMbps = (upBody.length * 8) / 1_000_000 / ulSecs;

  results.innerHTML =
    `Ping: ${ping} ms<br>` +
    `Download: ${dlMbps.toFixed(2)} Mbps<br>` +
    `Upload: ${ulMbps.toFixed(2)} Mbps<br>` +
    `Data used: DL ${(dlBytes/1_000_000).toFixed(1)} MB, ` +
    `UL ${(upBody.length/1_000_000).toFixed(1)} MB`;
}
