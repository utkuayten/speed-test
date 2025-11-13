// static/upload.js
document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("uploadBtn");
  const gaugeText = document.getElementById("uploadGaugeText");
  const ctx = document.getElementById("uploadChart").getContext("2d");
  let worker = null;

  // === Chart setup ===
  const chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label: "Upload Speed (Mbps)",
        data: [],
        borderColor: "#28a745",
        borderWidth: 2,
        fill: false,
        tension: 0.25
      }]
    },
    options: {
      animation: false,
      responsive: true,
      scales: {
        x: { title: { display: true, text: "Time (s)" } },
        y: { title: { display: true, text: "Speed (Mbps)" }, beginAtZero: true }
      }
    }
  });

  // === Inline worker (adaptive upload) ===
  const workerCode = `
    let stop = false, ports = [8080,8081];
    let hostname = "", proto = "http";
    let fragSize = 4 * 1024 * 1024, connections = 4, maxConnections = 64;
    const HISTORY_LEN = 5, history = [];

    onmessage = (e) => {
      ({ hostname, duration = 10 } = e.data);
      proto = location.protocol.startsWith("https") ? "https" : "http";
      stop = false;
      startTest(duration);
    };

    async function startTest(duration) {
      const chunk = new Blob([new Uint8Array(fragSize)]);
      const stats = Array.from({ length: connections }, () => ({ bytes: 0 }));
      for (let i = 0; i < connections; i++) sendChunk(i, stats, chunk);

      const t0 = performance.now();
      let prevTotal = 0, frozen = false, prevAvg = 0, peak5s = 0;
      const secondHalf = [];

      const timer = setInterval(() => {
        const elapsed = (performance.now() - t0) / 1000;
        const total = stats.reduce((a, s) => a + s.bytes, 0);
        const delta = Math.max(0, total - prevTotal);
        prevTotal = total;

        const mbps = (delta * 8) / 1e6 / 0.5;
        history.push(mbps);
        if (history.length > HISTORY_LEN) history.shift();
        const avg5s = history.reduce((a, b) => a + b, 0) / history.length;
        peak5s = Math.max(peak5s, avg5s);
        if (elapsed >= duration / 2) secondHalf.push(avg5s);
        postMessage({ elapsed, avg5s });

        // Adaptive scaling (same logic as download)
        if (!frozen && elapsed < duration / 2 && prevAvg !== 0 && avg5s > prevAvg * 1.1) {
          const newConn = Math.min(connections * 1.5, maxConnections);
          if (newConn > connections) {
            for (let i = connections; i < newConn; i++) {
              stats.push({ bytes: 0 });
              sendChunk(i, stats, chunk);
            }
            connections = newConn;
          }
          fragSize = Math.min(fragSize * 2, 64 * 1024 * 1024);
          postMessage({ log: '🚀 Expanded → ' + connections + ' conns, ' + (fragSize / 1024 / 1024).toFixed(1) + ' MB' });
        }

        prevAvg = avg5s;
        if (elapsed >= duration / 2 && !frozen) frozen = true;
        if (elapsed >= duration) {
          stop = true;
          clearInterval(timer);
          const steady = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
          postMessage({ done: true, peak5s, steady });
        }
      }, 500);
    }

    async function sendChunk(id, stats, chunk) {
      const proto = location.protocol.startsWith("https") ? "https" : "http";
      while (!stop) {
        const port = ports[id % ports.length];
        const url = proto + '://' + hostname + ':' + port + '/upload?r=' + Math.random().toString(36).slice(2);
        try {
          const res = await fetch(url, { method: "POST", body: chunk, cache: "no-store", mode: "cors" });
          if (res.ok) stats[id].bytes += fragSize;
        } catch {
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }
  `;

  const workerURL = URL.createObjectURL(new Blob([workerCode], { type: "application/javascript" }));

  // === Main UI logic ===
  startBtn.addEventListener("click", async () => {
    if (worker) try { worker.terminate(); } catch {}
    startBtn.disabled = true;
    gaugeText.textContent = "Starting...";
    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.update();

    try {
      const hostname = location.hostname || "127.0.0.1";
      const duration = 10;
      const start = performance.now();

      worker = new Worker(workerURL);
      worker.postMessage({ hostname, duration });

      worker.onmessage = (e) => {
        const d = e.data;
        if (d.avg5s !== undefined) {
          const elapsed = ((performance.now() - start) / 1000).toFixed(1);
          chart.data.labels.push(elapsed);
          chart.data.datasets[0].data.push(d.avg5s.toFixed(1));
          chart.update();
          gaugeText.textContent = d.avg5s.toFixed(1) + " Mbps";
        }
        if (d.done) {
          gaugeText.textContent =
            "Peak: " + d.peak5s.toFixed(1) +
            " Mbps | Steady: " + d.steady.toFixed(1) + " Mbps";
          startBtn.disabled = false;
          worker.terminate();
          worker = null;
        }
      };
    } catch (err) {
      console.error("Upload test failed:", err);
      gaugeText.textContent = "Error";
      startBtn.disabled = false;
    }
  });
});
