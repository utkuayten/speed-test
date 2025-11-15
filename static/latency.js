// static/latency.js
document.addEventListener("DOMContentLoaded", () => {

  const latencyGauge = document.getElementById("latencyGaugeText");
  const latencyBtn = document.getElementById("latencyBtn");

  const workerCode = `
    let host = "";

    onmessage = e => {
      host = e.data.host;
      measure();
    };

    async function pingOnce() {
      const url = "http://" + host + "/ping?x=" + Math.random();
      const t0 = performance.now();
      try { await fetch(url, { cache:"no-store" }); }
      catch { return null; }
      return performance.now() - t0;
    }

    async function measure() {
      const vals = [];
      for (let i=0;i<15;i++) {
        const ms = await pingOnce();
        if (ms !== null) {
          vals.push(ms);
          postMessage({ sample: ms, index: i+1 });
        }
        await new Promise(r=>setTimeout(r,50));
      }

      if (!vals.length) {
        postMessage({ done:true, peak:null, steady:null, jitter:null });
        return;
      }

      const peak = Math.min(...vals);
      const steadySlice = vals.slice(vals.length - 7);
      const steady = steadySlice.reduce((a,b)=>a+b,0)/steadySlice.length;

      const avg = vals.reduce((a,b)=>a+b)/vals.length;
      const variance = vals.reduce((a,b)=>a+(b-avg)**2,0)/vals.length;
      const jitter = Math.sqrt(variance);

      postMessage({ done:true, peak, steady, jitter });
    }
  `;

  const workerURL = URL.createObjectURL(new Blob([workerCode], {type:"application/javascript"}));

  // ===========================================================
  // Latency test
  // ===========================================================
  window.startLatencyTest = function() {

    latencyGauge.textContent = "Latency: measuring...";

    const worker = new Worker(workerURL);
    worker.postMessage({ host: location.hostname });

    worker.onmessage = e => {
      const d = e.data;

      // ---- LIVE SAMPLE ----
      if (d.sample != null) {

        // X axis = sample index (1..15)
        window.combinedChart.data.datasets[2].data.push({
          x: d.index,
          y: d.sample
        });

        window.combinedChart.update();

        latencyGauge.textContent =
          `Latency: ${d.sample.toFixed(1)} ms (sample ${d.index}/15)`;

        if (window.addLog)
          window.addLog(`[Latency] Sample ${d.index}/15 = ${d.sample.toFixed(1)} ms`);
      }

      // ---- FINISHED ----
      if (d.done) {
        if (d.peak != null) {
          latencyGauge.innerHTML =
            `Peak: ${d.peak.toFixed(1)} ms | Steady: ${d.steady.toFixed(1)} ms<br>` +
            `Jitter: ±${d.jitter.toFixed(1)} ms`;
        } else {
          latencyGauge.textContent = "Latency: n/a";
        }

        if (window.addLog)
          window.addLog(
            `[Latency] Peak=${d.peak?.toFixed(1)} ms | ` +
            `Steady=${d.steady?.toFixed(1)} ms | ` +
            `Jitter=±${d.jitter?.toFixed(1)} ms`
          );

        if (window.__latencyDone)
          window.__latencyDone(d);

        worker.terminate();
      }
    };
  };

  if (latencyBtn) {
    latencyBtn.addEventListener("click", () => {
      window.startLatencyTest();
    });
  }
});
