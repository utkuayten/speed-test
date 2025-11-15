// static/upload_ws.js
document.addEventListener("DOMContentLoaded", () => {
  const btn   = document.getElementById("uploadBtn");
  const gauge = document.getElementById("uploadGaugeText");

  if (!btn || !gauge || !window.combinedChart) {
    console.error("❌ WS upload: missing DOM or chart");
    return;
  }

  btn.addEventListener("click", () => startWSUpload(btn, gauge));
});

function startWSUpload(btn, gauge) {
  const chart = window.combinedChart;

  // Clear only UPLOAD dataset
  chart.data.datasets[1].data = [];
  chart.update();

  // Push starting point
  chart.data.datasets[1].data.push({ x: 0, y: 0 });
  chart.data.datasets[0].data.push({ x: 0, y: null });
  chart.update();

  btn.disabled = true;
  gauge.textContent = "Starting...";

  const TEST_DURATION = 15;
  const host = location.hostname;
  const ws   = new WebSocket("ws://" + host + "/ws-upload");
  ws.binaryType = "arraybuffer";

  const fragSize = 512 * 1024;  // 0.5 MB

  let running     = true;
  let startTime   = null;
  let totalBytes  = 0;

  const HISTORY_LEN = 5;
  let history = [];

  let peak5s        = 0;
  let steadySamples = [];

  ws.onopen = () => {
    console.log("WS OPEN");
    startTime = performance.now();
    sendNextFrame();
  };

  ws.onmessage = (e) => {
    const obj   = JSON.parse(e.data);
    const dt    = obj.dt;
    const bytes = obj.bytes;

    totalBytes += bytes;     // TRACK TOTAL UPLOADED

    const mbps = (bytes * 8) / 1e6 / dt;

    // Smooth 5-sample avg
    history.push(mbps);
    if (history.length > HISTORY_LEN) history.shift();

    const avg5s   = history.reduce((a, b) => a + b, 0) / history.length;
    const elapsed = (performance.now() - startTime) / 1000;

    peak5s = Math.max(peak5s, avg5s);
    if (elapsed >= TEST_DURATION / 2) {
      steadySamples.push(avg5s);
    }

    // Upload dataset
    chart.data.datasets[1].data.push({
      x: elapsed,
      y: avg5s
    });

    // Sync for download
    chart.data.datasets[0].data.push({
      x: elapsed,
      y: null
    });

    chart.update();

    gauge.textContent = avg5s.toFixed(1) + " Mbps";

    // Stop test
    if (elapsed >= TEST_DURATION) {
      running = false;
      ws.close();

      const steadyAvg = steadySamples.length
        ? steadySamples.reduce((a, b) => a + b, 0) / steadySamples.length
        : 0;

      const mbUsed = (totalBytes / 1e6).toFixed(2);

      // MULTI-LINE RESULT FORMAT
      gauge.innerHTML =
        `Peak: ${peak5s.toFixed(1)} Mbps<br>` +
        `Steady: ${steadyAvg.toFixed(1)} Mbps<br>` +
        `Used: ${mbUsed} MB`;

      // Notify full test controller
      window.__uploadDone?.({
        peak:   peak5s,
        steady: steadyAvg,
        usedMB: mbUsed
      });

      btn.disabled = false;
      return;
    }

    // Continue sending
    if (running) sendNextFrame();
  };

  function sendNextFrame() {
    if (ws.readyState !== WebSocket.OPEN) return;
    const buf = new Uint8Array(fragSize);
    ws.send(buf);
  }

  ws.onclose = () => {
    running = false;
    btn.disabled = false;
    console.log("WS CLOSED");
  };
}
