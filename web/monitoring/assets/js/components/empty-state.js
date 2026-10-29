// Design system: empty state "Tidak ada data yang cocok." untuk tabel.
// Footer tabel peringkat dan overlay grafik tren dirender langsung oleh menu Dashboard.
(function () {
  const EMPTY_TEXT = 'Tidak ada data yang cocok.';

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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', normalizeTableEmptyStates);
  else normalizeTableEmptyStates();
  new MutationObserver(normalizeTableEmptyStates).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
