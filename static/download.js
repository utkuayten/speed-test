// static/download.js
document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("startBtn");
  const gaugeText = document.getElementById("gaugeText");

  if (!startBtn || !gaugeText || !window.combinedChart) {
    console.error("❌ Missing DOM or chart");
    return;
  }

  let currentWorker = null;

  // ======================================================
  // INLINE WORKER (with totalBytes)
  // ======================================================
  const workerScript = `
    let fileSize = 0;
    let duration = 15;
    let hostname = "";
    let stop = false;

    let connections = 4;
    const maxConnections = 32;
    let fragSize = 4 * 1024 * 1024;

    const HISTORY_LEN = 5;
    const history = [];
    const ports = [8080, 8081];

    let totalBytes = 0;

    onmessage = (e) => {
      ({ duration, fileSize, hostname } = e.data);
      stop = false;
      totalBytes = 0;
      startTest();
    };

    function safeSpawn(id, connStats) {
      fetchRange(id, connStats).catch(()=>{});
    }

    function expandCapacity(avg5s, prevAvg, connStats) {
      if (avg5s > prevAvg * 1.20 && connStats.length === connections) {
        let scaled = false;

        const newConn = Math.min(connections * 2, maxConnections);
        if (newConn > connections) {
          const add = newConn - connections;
          postMessage({ log: '⚙️ +' + add + ' conns → ' + newConn });

          for (let i = connections; i < newConn; i++) {
            connStats.push({ bytes: 0 });
            safeSpawn(i, connStats);
          }

          connections = newConn;
          scaled = true;
        }

        if (fragSize < 64 * 1024 * 1024) {
          fragSize = Math.min(fragSize * 2, 64 * 1024 * 1024);
          postMessage({ log: '📦 frag → ' + (fragSize/1024/1024).toFixed(1) + 'MB' });
          scaled = true;
        }

        if (scaled) {
          postMessage({ log: '🚀 scaled → ' + connections + ' links, ' +
            (fragSize/1024/1024).toFixed(1) + 'MB block' });
        }
      }
    }

    async function startTest() {
      postMessage({ log: '🚀 download start — ' + connections + ' conns' });

      const connStats = Array.from({ length: connections }, () => ({ bytes: 0 }));

      for (let i = 0; i < connections; i++) safeSpawn(i, connStats);

      const t0 = performance.now();
      let prevTotal = 0;
      let prevAvg = 0;
      let frozen = false;

      let peak5s = 0;
      const steadySamples = [];

      const timer = setInterval(() => {
        const elapsed = (performance.now() - t0)/1000;

        const total = connStats.reduce((a,c)=>a+c.bytes,0);
        const delta = Math.max(0, total - prevTotal);
        prevTotal = total;

        totalBytes = total; // track total downloaded

        const mbps = (delta * 8) / 1e6 / 0.5;

        history.push(mbps);
        if (history.length > HISTORY_LEN) history.shift();

        const avg5s = history.reduce((a,b)=>a+b,0) / history.length;

        peak5s = Math.max(peak5s, avg5s);

        if (elapsed >= duration/2) {
          steadySamples.push(avg5s);
        }

        postMessage({ elapsed, avg5s });

        if (!frozen && elapsed < duration/2 && prevAvg > 0) {
          expandCapacity(avg5s, prevAvg, connStats);
        }
        prevAvg = avg5s;

        if (!frozen && elapsed >= duration/2) {
          frozen = true;
          postMessage({ log: '🧊 steady-phase locked' });
        }

        if (elapsed >= duration) {
          stop = true;
          clearInterval(timer);

          const steadyAvg = steadySamples.length
            ? steadySamples.reduce((a,b)=>a+b,0)/steadySamples.length
            : 0;

          postMessage({
            done:true,
            peak5s,
            steadyAvg,
            totalBytes
          });
        }
      }, 500);
    }

    async function fetchRange(id, connStats) {
      let rr = id % ports.length;

      while (!stop) {
        const port = ports[rr];
        const start = Math.floor(Math.random() * Math.max(1, fileSize - fragSize));
        const end = Math.min(start + fragSize - 1, fileSize - 1);

        const url = "http://" + hostname + ":" + port + "/internet-file?r=" +
          Math.random().toString(36).slice(2);

        try {
          const res = await fetch(url, {
            headers: { Range:"bytes=" + start + "-" + end },
            cache:"no-store",
            mode:"cors"
          });

          if (!res.ok) continue;

          const reader = res.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done || stop) break;
            connStats[id].bytes += value.byteLength;
          }

        } catch {
          await new Promise(r => setTimeout(r, 200));
        }

        rr = (rr + 1) % ports.length;
      }
    }
  `;

  const workerURL = URL.createObjectURL(
    new Blob([workerScript], { type: "application/javascript" })
  );

  // ======================================================
  // START BUTTON
  // ======================================================
  startBtn.addEventListener("click", async () => {

    if (currentWorker) {
      try { currentWorker.terminate(); } catch {}
      currentWorker = null;
    }

    window.combinedChart.data.datasets[0].data = [];
    window.combinedChart.data.datasets[0].data.push({ x: 0, y: 0 });
    window.combinedChart.update();

    startBtn.disabled = true;
    gaugeText.textContent = "Starting...";

    try {
      const meta = await fetch("/meta", { cache: "no-store" }).then(r => r.json());

      const w = new Worker(workerURL);
      currentWorker = w;

      const t0 = performance.now();

      w.postMessage({
        duration: 15,
        fileSize: meta.size,
        hostname: location.hostname
      });

      w.onmessage = (e) => {
        const d = e.data;

        if (d.log) console.log(d.log);

        if (typeof d.avg5s === "number") {
          const elapsed = (performance.now() - t0) / 1000;
          const speed = d.avg5s;

          window.combinedChart.data.datasets[0].data.push({
            x: elapsed,
            y: speed
          });

          window.combinedChart.update();

          gaugeText.textContent = speed.toFixed(1) + " Mbps";
        }

        // ====================================================
        // FINISHED — MULTI-LINE FORMAT
        // ====================================================
        if (d.done) {
          const mbUsed = (d.totalBytes / 1e6).toFixed(2);

          gaugeText.innerHTML =
            `Peak: ${d.peak5s.toFixed(1)} Mbps<br>` +
            `Steady: ${d.steadyAvg.toFixed(1)} Mbps<br>` +
            `Used: ${mbUsed} MB`;

          window.__downloadDone?.(d);

          startBtn.disabled = false;
          try { w.terminate(); } catch {}
          currentWorker = null;
        }
      };

    } catch (err) {
      console.error("❌ Download init failed:", err);
      gaugeText.textContent = "Download init error";
      startBtn.disabled = false;
    }
  });
});
