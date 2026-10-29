// Design system: empty state "Tidak ada data yang cocok." untuk tabel, footer tabel peringkat, dan grafik tren.
(function () {
  const EMPTY_TEXT = 'Tidak ada data yang cocok.';
  const hasValue = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };

  // Tabel kosong selalu menampilkan satu baris pesan empty state yang seragam.
  function normalizeTableEmptyStates() {
    document.querySelectorAll('table tbody').forEach(tbody => {
      const rows = Array.from(tbody.querySelectorAll(':scope > tr'));
      if (!rows.length) {
        const table = tbody.closest('table');
        if (!table || table.dataset.keepEmptyState === 'false') return;
        const cols = Math.max(1, table.querySelectorAll('thead th').length || 1);
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = cols;
        td.className = 'pantau-empty-state';
        td.textContent = EMPTY_TEXT;
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }
      if (rows.length === 1) {
        const cells = Array.from(rows[0].querySelectorAll('td'));
        if (cells.length === 1 && cells[0].colSpan > 1) {
          const text = (cells[0].textContent || '').trim().toLowerCase();
          if (/tidak ada data|belum ada data|no data|no matching|data kosong/.test(text)) {
            if (cells[0].textContent.trim() !== EMPTY_TEXT) cells[0].textContent = EMPTY_TEXT;
            if (!cells[0].classList.contains('pantau-empty-state')) cells[0].classList.add('pantau-empty-state');
          }
        }
      }
    });
  }

  // Footer tabel peringkat Dashboard tetap terlihat (info + halaman 1) walau hasil filter kosong.
  function ensureFooter(id) {
    const el = document.getElementById(id); if (!el) return;
    el.style.setProperty('display', 'flex', 'important'); el.style.setProperty('visibility', 'visible', 'important'); el.style.setProperty('min-height', '40px', 'important');
    let info = el.querySelector(':scope > div:first-child');
    if (!info) { info = document.createElement('div'); info.className = 'text-xs text-slate-500'; info.textContent = 'Menampilkan 0 dari 0 data'; el.appendChild(info); }
    info.style.setProperty('display', 'block', 'important'); info.style.setProperty('visibility', 'visible', 'important');
    let controls = el.querySelector(':scope > div:nth-child(2)');
    if (!controls) { controls = document.createElement('div'); controls.className = 'flex items-center gap-1.5'; el.appendChild(controls); }
    controls.style.setProperty('display', 'flex', 'important'); controls.style.setProperty('visibility', 'visible', 'important');
    if (!controls.children.length) {
      ['fa-chevron-left', 'fa-chevron-right'].forEach(cls => { const b = document.createElement('button'); b.type = 'button'; b.disabled = true; b.setAttribute('aria-label', 'Tidak ada halaman'); b.className = 'px-3 py-2 rounded-xl border text-xs font-medium bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'; b.innerHTML = '<i class="fa-solid ' + cls + ' text-xs"></i>'; controls.appendChild(b); });
    }
    if (!controls.querySelector('[aria-current="page"], [aria-label="Halaman 1"]')) {
      const page = document.createElement('button');
      page.type = 'button'; page.textContent = '1'; page.disabled = false;
      page.setAttribute('aria-label', 'Halaman 1'); page.setAttribute('aria-current', 'page');
      page.className = 'px-3 py-2 rounded-xl border text-xs font-medium transition pantau-green-active';
      page.style.cssText = 'display:inline-flex!important;visibility:visible!important;opacity:1!important;align-items:center!important;justify-content:center!important;min-width:32px!important;min-height:32px!important;color:#fff!important;background:linear-gradient(135deg,#0f766e,#059669)!important;border:1px solid #047857!important;';
      page.onclick = function () {
        topBayarPage = 1;
        topTagihanPage = 1;
        if (id === 'topBayarPagination') renderTopTable('topBayarBody', topBayarRows, 1, 'bayar');
        if (id === 'topTagihanPagination') renderTopTable('topTagihanBody', topTagihanRows, 1, 'tagihan');
      };
      const right = controls.querySelector('button:last-child');
      if (right && controls.children.length >= 2) controls.insertBefore(page, right); else controls.appendChild(page);
    }
  }

  // Grafik tren tanpa titik data: pesan di bawah grafik + overlay di tengah area grafik.
  function updateTrendEmptyState() {
    const canvas = document.getElementById('chartTrend');
    const notice = document.getElementById('trendDataNotice');
    if (!canvas || !notice || !canvas.parentElement) return;
    const wrap = canvas.parentElement;
    const chart = window.Chart && typeof Chart.getChart === 'function' ? Chart.getChart(canvas) : null;
    const chartHasData = !!(chart && (chart.data.datasets || []).some(ds => Array.isArray(ds.data) && ds.data.some(hasValue)));
    if (chart && !chartHasData) {
      setText(notice, EMPTY_TEXT);
      notice.classList.remove('hidden');
      notice.classList.add('text-center', 'text-sm', 'text-slate-500', 'py-6');
    }
    wrap.style.position = 'relative';
    let overlay = wrap.querySelector(':scope > .pantau-chart-empty-overlay');
    const noData = (notice.textContent || '').trim() === EMPTY_TEXT || (chart && !chartHasData);
    if (noData) {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'pantau-chart-empty-overlay';
        wrap.appendChild(overlay);
      }
      setText(overlay, EMPTY_TEXT);
      overlay.style.setProperty('display', 'flex', 'important');
      overlay.style.setProperty('visibility', 'visible', 'important');
      overlay.style.setProperty('opacity', '1', 'important');
    } else if (overlay) {
      overlay.remove();
    }
  }

  function run() {
    normalizeTableEmptyStates();
    ensureFooter('topTagihanPagination');
    ensureFooter('topBayarPagination');
    updateTrendEmptyState();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
  new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  if (window.Chart && Chart.prototype && !Chart.prototype.__pantauEmptyStateWrapped) {
    const originalUpdate = Chart.prototype.update;
    Chart.prototype.update = function () {
      const result = originalUpdate.apply(this, arguments);
      requestAnimationFrame(run);
      return result;
    };
    Chart.prototype.__pantauEmptyStateWrapped = true;
  }
})();
