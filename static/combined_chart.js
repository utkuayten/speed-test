// static/combined_chart.js
document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("combinedChart");
  if (!canvas) {
    console.error("❌ combinedChart canvas missing");
    return;
  }

  const ctx = canvas.getContext("2d");

  window.combinedChart = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [
        {
          label: "Download",
          data: [],
          borderColor: "#2196f3",
          backgroundColor: "rgba(33,150,243,0.2)",
          fill: false,
          tension: 0.2,
          pointRadius: 0,
          yAxisID: "speedAxis"
        },

        {
          label: "Upload",
          data: [],
          borderColor: "#9c27b0",
          backgroundColor: "rgba(156,39,176,0.2)",
          fill: false,
          tension: 0.2,
          pointRadius: 0,
          yAxisID: "speedAxis"
        },

        {
          label: "Latency (ms)",
          data: [],
          borderColor: "#ffeb3b",
          backgroundColor: "rgba(255,235,59,0.2)",
          fill: false,
          tension: 0.2,
          pointRadius: 3,
          borderWidth: 2,
          yAxisID: "latencyAxis"
        }
      ]
    },

    options: {
      responsive: true,
      animation: false,
      parsing: false,     // MUST KEEP for x/y numeric pairs

      scales: {
        x: {
          type: "linear",
          title: { display: true, text: "Seconds" },
          ticks: {
            callback: (v) => v.toFixed(1)
          }
        },

        speedAxis: {
          type: "linear",
          position: "left",
          beginAtZero: true,
          title: { display: true, text: "Mbps" }
        },

        latencyAxis: {
          type: "linear",
          position: "right",
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          title: { display: true, text: "Latency (ms)" }
        }
      }
    }
  });
});
