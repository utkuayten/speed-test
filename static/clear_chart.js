// static/clear_chart.js
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("clearChartBtn");

  if (!btn || !window.combinedChart) {
    console.error("❌ Clear chart button or chart missing");
    return;
  }

  btn.addEventListener("click", () => {
    // Clear all datasets
    window.combinedChart.data.datasets.forEach(ds => {
      ds.data = [];
    });

    // Clear X labels if you are using labels
    window.combinedChart.data.labels = [];

    window.combinedChart.update();

    console.log("🧽 Chart cleared.");
  });
});
