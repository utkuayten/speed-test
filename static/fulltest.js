// static/fulltest.js
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("fullTestBtn");
  const latencyGauge = document.getElementById("latencyGaugeText");

  function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function runDownload() {
    return new Promise(resolve => {
      window.__downloadDone = () => {
        console.log("✅ DOWNLOAD DONE");
        resolve(true);
      };
      document.getElementById("startBtn").click();
    });
  }

  function runUpload() {
    return new Promise(resolve => {
      window.__uploadDone = () => {
        console.log("✅ UPLOAD DONE");
        resolve(true);
      };
      document.getElementById("uploadBtn").click();
    });
  }

  function runLatency() {
    return new Promise(resolve => {
      console.log("▶️ LATENCY START");

      window.__latencyDone = (res) => {
        console.log("✅ LATENCY DONE", res);
        resolve(res);
      };

      window.startLatencyTest(latencyGauge);   // ALWAYS DEFINED
    });
  }

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    console.log("🚀 FULL TEST START");

    await runDownload();
    await wait(300);

    await runUpload();
    await wait(300);

    await runLatency();

    console.log("🎉 FULL TEST FINISHED");
    btn.disabled = false;
  });
});
