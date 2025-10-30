const META_URL = "/meta";
const FILE_URL = "/internet-file";

let CONNECTIONS_DEFAULT = 3;
let CONNECTIONS = CONNECTIONS_DEFAULT;
const MAX_CONNECTIONS = 8;
let FRAG_SIZE = 64 * 1024 * 1024;
const DURATION_SEC = 30;
const HALF_DURATION = DURATION_SEC / 2;

let fileSize = 0, nextOffset = 0, stop = false, startTime = 0;
let connStats = [];
const throughputHistory = [];
const HISTORY_LEN = 5;

const logDiv = document.getElementById("log");
const ctx = document.getElementById("avgChart").getContext("2d");
const gaugeCtx = document.getElementById("speedGauge").getContext("2d");
const gaugeText = document.getElementById("gaugeText");

// === Line Chart ===
const avgChart = new Chart(ctx, {
  type: "line",
  data: {
    labels: [],
    datasets: [{
      label: "Last 5s Average (Mbps)",
      borderColor: "#58a6ff",
      backgroundColor: "rgba(88,166,255,0.2)",
      data: [],
      tension: 0.3,
    }]
  },
  options: {
    animation: false,
    scales: {
      x: { title: { display: true, text: "Time (s)" }, ticks: { color: "#c9d1d9" } },
      y: { title: { display: true, text: "Mbps" }, ticks: { color: "#c9d1d9" } }
    },
    plugins: { legend: { labels: { color: "#c9d1d9" } } }
  }
});

// === Gauge Chart ===
let gaugeChart = new Chart(gaugeCtx, {
  type: 'doughnut',
  data: {
    labels: ['Speed', 'Remaining'],
    datasets: [{
      data: [0, 100],
      backgroundColor: ['#58a6ff', '#30363d'],
      borderWidth: 0,
      circumference: 180,
      rotation: 270,
      cutout: '80%',
    }]
  },
  options: {
    animation: false,
    plugins: { legend: { display: false } },
  }
});

function updateGauge(speed) {
  const capped = Math.min(speed, 1000);
  gaugeChart.data.datasets[0].data = [capped / 10, 100 - (capped / 10)];
  gaugeChart.update();
  gaugeText.textContent = `${speed.toFixed(0)} Mbps`;
}

function log(msg) {
  logDiv.textContent += msg + "\n";
  logDiv.scrollTop = logDiv.scrollHeight;
}

async function getMeta() {
  const r = await fetch(META_URL, { cache: "no-store" });
  const j = await r.json();
  fileSize = j.size;
  log(`File: ${j.name} | ${(fileSize / 1e6).toFixed(2)} MB`);
}

function claimFragment() {
  const start = nextOffset;
  const end = Math.min(start + FRAG_SIZE - 1, fileSize - 1);
  nextOffset = end + 1;
  if (nextOffset >= fileSize) nextOffset = 0;
  return { start, end };
}

async function fetchRange(cid) {
  while (!stop) {
    const { start, end } = claimFragment();
    const res = await fetch(FILE_URL, {
      headers: { Range: `bytes=${start}-${end}` },
      cache: "no-store"
    });
    const reader = res.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done || stop) break;
      connStats[cid].bytes += value.byteLength;
    }
  }
}

// === Reset but keep old results ===
function resetAll() {
  stop = false;
  nextOffset = 0;
  fileSize = 0;
  startTime = 0;
  connStats = [];
  throughputHistory.length = 0;
  CONNECTIONS = CONNECTIONS_DEFAULT;

  // Preserve previous results
  log("\n-----------------------------------------------");
  log("🧹 Starting new test...\n");

  // Reset visuals
  avgChart.data.labels = [];
  avgChart.data.datasets[0].data = [];
  avgChart.update();
  updateGauge(0);
}

async function runTest() {
  resetAll(); // clean start
  await getMeta();

  connStats = Array.from({ length: CONNECTIONS }, () => ({ bytes: 0, last: 0 }));
  for (let i = 0; i < CONNECTIONS; i++) fetchRange(i);

  startTime = performance.now();
  let prevTotalBytes = 0;
  let cooldown = 0;

  const timer = setInterval(() => {
    const now = performance.now();
    const elapsed = (now - startTime) / 1000;
    const totalBytes = connStats.reduce((a, c) => a + c.bytes, 0);
    const deltaBytes = totalBytes - prevTotalBytes;
    prevTotalBytes = totalBytes;

    const currentMbps = (deltaBytes * 8) / 1e6 / 0.5; // since updates every 0.5s
    throughputHistory.push(currentMbps);
    if (throughputHistory.length > HISTORY_LEN) throughputHistory.shift();
    const avg5s = throughputHistory.reduce((a, b) => a + b, 0) / throughputHistory.length;

    // === Update visuals ===
    updateGauge(avg5s);
    avgChart.data.labels.push(elapsed.toFixed(1));
    avgChart.data.datasets[0].data.push(avg5s);
    if (avgChart.data.labels.length > 60) {
      avgChart.data.labels.shift();
      avgChart.data.datasets[0].data.shift();
    }
    avgChart.update();

    // === Log output ===
    let totalMbps = 0;
    let out = `[${elapsed.toFixed(1)}s]`;
    for (let i = 0; i < CONNECTIONS; i++) {
      const stat = connStats[i];
      const delta = stat.bytes - stat.last;
      stat.last = stat.bytes;
      const mbps = (delta * 8) / 1e6 / 0.5;
      totalMbps += mbps;
      out += ` | c${i + 1}: ${mbps.toFixed(2)} Mbps`;
    }
    out += ` | total: ${totalMbps.toFixed(2)} Mbps | avg(5s): ${avg5s.toFixed(2)} Mbps`;
    log(out);

    // === Adaptive Phase (first half only) ===
    if (elapsed < HALF_DURATION && CONNECTIONS < MAX_CONNECTIONS) {
      cooldown -= 0.5;
      const avgMbps = avg5s;
      if (cooldown <= 0 && currentMbps > avgMbps * 1.10) {
        CONNECTIONS++;
        connStats.push({ bytes: 0, last: 0 });
        fetchRange(CONNECTIONS - 1);
        log(`🟢 Added channel: ${CONNECTIONS} (current ${currentMbps.toFixed(2)} > avg5s ${avg5s.toFixed(2)})`);
        cooldown = 1.5;
      }
    }

    // === Stop test after duration ===
    if (elapsed >= DURATION_SEC) {
      stop = true;
      clearInterval(timer);

      const totalDataMB = totalBytes / 1e6;
      const avgOverallMbps = (totalDataMB * 8) / elapsed;
      log(`\n=== RESULT ===
Connections: ${CONNECTIONS}
Data: ${totalDataMB.toFixed(2)} MB
Average: ${avgOverallMbps.toFixed(2)} Mbps
✅ Test finished. You can start another one below.`);
      updateGauge(avgOverallMbps);
    }
  }, 500); // update every 0.5s
}

document.getElementById("startBtn").addEventListener("click", runTest);
