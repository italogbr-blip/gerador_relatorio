// assets/js/heatmap.js
// Renderiza um heatmap (na prática, um gráfico de barras) usando Chart.js
function renderHeatmap(labels, data) {
  const ctx = document.getElementById('heatmapChart').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Relatórios por dia',
        data: data,
        backgroundColor: 'rgba(59,130,246,0.6)', // azul Tailwind 500
        borderColor: 'rgba(59,130,246,1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}
