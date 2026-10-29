// Design system: tombol mode grafik nonaktif bila grafik tidak punya data.
(function () {
  function sync() {
    if (typeof window.syncTrendModeDisabledState === 'function') {
      window.syncTrendModeDisabledState();
      return;
    }
    const canvas = document.getElementById('chartTrend');
    const chart = canvas && window.Chart && Chart.getChart ? Chart.getChart(canvas) : null;
    const hasData = !!(chart && (chart.data.datasets || []).some(ds => Array.isArray(ds.data) && ds.data.some(v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)))));
    document.querySelectorAll('[data-trend-mode]').forEach(button => {
      button.disabled = !hasData;
      button.setAttribute('aria-disabled', hasData ? 'false' : 'true');
      button.title = hasData ? '' : 'Tidak ada data yang cocok.';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  else sync();
  window.addEventListener('load', sync);
})();
