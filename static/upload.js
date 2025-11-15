// static/upload.js
document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("uploadBtn");
  const gaugeText = document.getElementById("uploadGaugeText");

  if (!startBtn || !gaugeText || !window.combinedChart) {
    console.error("❌ Upload DOM / chart missing");
    return;
  }

  let currentWorker = null;

  // ================================
  // UPLOAD WORKER (stable version)
  // ================================
  const workerCode = `
    let stop = false;

    // MUCH BETTER for browsers:
    let connections = 3;
    const maxConnections = 6;

    let fragSize = 4 * 1024 * 1024; // start 4MB
    const maxFrag = 32 * 1024 * 1024;

    const HISTORY = 5;
    const history = [];

    const ports = [8080,8081];
    let hostname = "";
    let duration = 15;

    onmessage = (e) => {
      hostname = e.data.hostname;
      duration = e.data.duration;
      stop = false;
      startUpload();
    };

    // Create NEW Blob per request → Stable Upload
    function makeBlob(size) {
      return new Blob([ new Uint8Array(size) ]);
    }

    async function startUpload() {
      const stats = [];
      for (let i = 0; i < connections; i++) {
        stats[i] = { bytes: 0 };
        runUploader(i, stats);
      }

      const t0 = performance.now();
      let prevTotal = 0;
      let prevAvg = 0;
      let frozen = false;

      let peak = 0;
      const steadySamples = [];

      const timer = setInterval(() => {
        const elapsed = (performance.now() - t0) / 1000;

        // Count total uploaded bytes
        const total = stats.reduce((a,s)=>a+s.bytes,0);
        const delta = Math.max(0,total - prevTotal);
        prevTotal = total;

        const mbps = (delta * 8) / 1e6 / 0.5;

        history.push(mbps);
        if (history.length > HISTORY) history.shift();
        const avg = history.reduce((a,b)=>a+b,0)/history.length;

        peak = Math.max(peak, avg);
        if (elapsed >= duration/2) steadySamples.push(avg);

        postMessage({ avg5s: avg, elapsed });

        // Adaptation like download
        if (!frozen && elapsed < duration/2 && prevAvg > 0) {
          if (avg > prevAvg * 1.20) {

            // Grow chunk FIRST (best for browsers)
            if (fragSize < maxFrag) {
              fragSize = Math.min(fragSize * 2, maxFrag);
              postMessage({ log: "📦 Chunk → " + (fragSize/1024/1024).toFixed(1) + " MB" });
            } else if (connections < maxConnections) {
              // Only then increase connection count
              connections++;
              stats.push({ bytes: 0 });
              runUploader(connections - 1, stats);
              postMessage({ log: "⚙️ Connections → " + connections });
            }
          }
        }

        prevAvg = avg;

        if (!frozen && elapsed >= duration/2) {
          frozen = true;
          postMessage({ log: "🧊 Steady phase — locked" });
        }

        if (elapsed >= duration) {
          stop = true;
          clearInterval(timer);

          const steady = steadySamples.length
            ? steadySamples.reduce((a,b)=>a+b)/steadySamples.length
            : 0;

          postMessage({ done: true, peak5s: peak, steady });
        }
      }, 500);
    }

    async function runUploader(id, stats) {
      let rr = id % ports.length;

      while (!stop) {
        const port = ports[rr];
        const url = "http://" + hostname + ":" + port +
                    "/upload?r=" + Math.random().toString(36).slice(2);

        const blob = makeBlob(fragSize);

        try {
          const res = await fetch(url, {
            method: "POST",
            body: blob,
            cache: "no-store",
            mode: "cors"
          });

          if (res.ok) stats[id].bytes += fragSize;

        } catch {
          await new Promise(r => setTimeout(r, 40));  // micro-delay
        }

        rr = (rr + 1) % ports.length;
      }
    }
  `;

  const workerURL = URL.createObjectURL(
    new Blob([workerCode], { type: "application/javascript" })
  );

  // ================================
  // BUTTON CLICK
  // ================================
  startBtn.addEventListener("click", () => {
    if (currentWorker) { try { currentWorker.terminate(); } catch {} }

    startBtn.disabled = true;
    gaugeText.textContent = "Starting upload...";

    // Reset upload dataset (dataset[1])
    window.combinedChart.data.labels = [];
    window.combinedChart.data.datasets[1].data = [];
    window.combinedChart.update();

    const w = new Worker(workerURL);
    currentWorker = w;

    const start = performance.now();

    w.postMessage({
      hostname: location.hostname,
      duration: 15
    });

    w.onmessage = (e) => {
      const d = e.data;

      if (d.log) console.log(d.log);

      if (typeof d.avg5s === "number") {
        const elapsed = ((performance.now() - start) / 1000).toFixed(1);
        const mbps = parseFloat(d.avg5s.toFixed(1));

        // Update combined chart upload dataset (index 1)
        window.combinedChart.data.labels.push(elapsed);
        window.combinedChart.data.datasets[1].data.push(mbps);
        window.combinedChart.update();

        gaugeText.textContent = mbps + " Mbps";
      }

      if (d.done) {
        gaugeText.textContent =
          "Peak: " + d.peak5s.toFixed(1) +
          " Mbps | Steady: " + d.steady.toFixed(1) + " Mbps";

        try { w.terminate(); } catch {}
        currentWorker = null;
        startBtn.disabled = false;
      }
    };
  });
});
