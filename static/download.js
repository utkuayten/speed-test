document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("startBtn");
  const gaugeText = document.getElementById("gaugeText");
  const chartCanvas = document.getElementById("avgChart");

  // Safety checks
  if (!startBtn || !gaugeText || !chartCanvas) {
    console.error("❌ Missing required DOM elements");
    return;
  }

  let chart = null;
  let currentWorker = null;

  // === Chart setup ===
  function createChart() {
    const ctx = chartCanvas.getContext("2d");
    if (chart) chart.destroy();

    chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [{
          label: "Download Speed (Mbps)",
          data: [],
          borderColor: "blue",
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
  }

  // === INLINE WORKER CODE (FULL FIXED VERSION) ===
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

    // Only 2 stable backend ports
    const ports = [8080, 8081];

    onmessage = (e) => {
      ({ duration, fileSize, hostname } = e.data);
      stop = false;
      startTest();
    };

    function safeSpawn(id, connStats) {
      fetchRange(id, connStats).catch(() => {});
    }

    function expandCapacity(avg5s, prevAvg, connStats) {
      if (avg5s > prevAvg * 1.20 && connStats.length === connections) {
        let scaled = false;

        const newConn = Math.min(connections * 2, maxConnections);
        if (newConn > connections) {
          const add = newConn - connections;
          postMessage({ log: '⚙️ Rising throughput → +' + add + ' connections (' + newConn + ')' });

          for (let i = connections; i < newConn; i++) {
            connStats.push({ bytes: 0 });
            safeSpawn(i, connStats);
          }
          connections = newConn;
          scaled = true;
        }

        if (fragSize < 64 * 1024 * 1024) {
          fragSize = Math.min(fragSize * 2, 64 * 1024 * 1024);
          postMessage({ log: '📦 Fragment size → ' + (fragSize / 1024 / 1024).toFixed(1) + ' MB' });
          scaled = true;
        }

        if (scaled) {
          postMessage({
            log: '🚀 Expansion done: ' + connections +
                 ' links, ' + (fragSize / 1024 / 1024).toFixed(1) + ' MB blocks'
          });
        }
      }
    }

    async function startTest() {
      postMessage({ log: '🚀 Download test start — ' + connections + ' initial connections' });

      const connStats = Array.from({ length: connections }, () => ({ bytes: 0 }));

      for (let i = 0; i < connections; i++) safeSpawn(i, connStats);

      const t0 = performance.now();
      let prevTotal = 0;
      let prevAvg = 0;
      let frozen = false;

      let peak5s = 0;
      const steadySamples = [];

      const timer = setInterval(() => {
        const elapsed = (performance.now() - t0) / 1000;

        const total = connStats.reduce((a, c) => a + c.bytes, 0);
        const delta = Math.max(0, total - prevTotal);
        prevTotal = total;

        const mbps = (delta * 8) / 1e6 / 0.5;

        history.push(mbps);
        if (history.length > HISTORY_LEN) history.shift();

        const avg5s = history.reduce((a, b) => a + b, 0) / history.length;
        peak5s = Math.max(peak5s, avg5s);

        if (elapsed >= duration / 2) steadySamples.push(avg5s);

        postMessage({ elapsed, avg5s });

        if (!frozen && elapsed < duration/2 && prevAvg > 0) {
          expandCapacity(avg5s, prevAvg, connStats);
        }
        prevAvg = avg5s;

        if (!frozen && elapsed >= duration / 2) {
          frozen = true;
          postMessage({ log: '🧊 Steady phase — config locked' });
        }

        if (elapsed >= duration) {
          stop = true;
          clearInterval(timer);
          const steadyAvg = steadySamples.length
            ? steadySamples.reduce((a,b)=>a+b)/steadySamples.length
            : 0;

          postMessage({ done: true, peak5s, steadyAvg });
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
            headers: { Range: "bytes=" + start + "-" + end },
            cache: "no-store",
            mode: "cors"
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

  const workerURL = URL.createObjectURL(new Blob([workerScript], { type: "application/javascript" }));

  // === Start button logic ===
  startBtn.addEventListener("click", async () => {
    if (currentWorker) {
      try { currentWorker.terminate(); } catch {}
      currentWorker = null;
    }

    createChart();
    startBtn.disabled = true;
    gaugeText.textContent = "Starting...";

    try {
      const meta = await fetch("/meta", { cache: "no-store" }).then(r => r.json());
      const w = new Worker(workerURL);
      currentWorker = w;

      const startTime = performance.now();

      w.postMessage({
        duration: 15,
        fileSize: meta.size,
        hostname: location.hostname
      });

      w.onmessage = (e) => {
        const d = e.data;

        if (d.log) console.log(d.log);

        if (typeof d.avg5s === "number") {
          const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
          const speed = d.avg5s.toFixed(1);

          chart.data.labels.push(elapsed);
          chart.data.datasets[0].data.push(speed);
          chart.update();

          gaugeText.textContent = speed + " Mbps";
        }

        if (d.done) {
          gaugeText.textContent =
            "Peak: " + d.peak5s.toFixed(1) +
            " Mbps | Steady: " + d.steadyAvg.toFixed(1) + " Mbps";

          startBtn.disabled = false;
          try { w.terminate(); } catch {}
          currentWorker = null;
        }
      };

    } catch (err) {
      console.error("Download init failed:", err);
      gaugeText.textContent = "Download init error";
      startBtn.disabled = false;
    }
  });
});
