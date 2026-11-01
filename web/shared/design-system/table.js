// Design system: sel .pantau-table yang terpotong "..." menampilkan teks lengkapnya sebagai tooltip saat disorot.
(function(){
  if(window.__pantauTableTooltips) return;
  window.__pantauTableTooltips=true;
  document.addEventListener('mouseover',e=>{
    const td=e.target.closest && e.target.closest('.pantau-table td');
    if(td && !td.title && td.scrollWidth>td.clientWidth) td.title=td.textContent.trim();
  });
})();

// Header urut (th.column-sortable): bisa dipakai keyboard (Tab, Enter/Spasi) dan arah urutnya terbaca screen reader.
(function(){
  if(window.__pantauSortableHeaders) return;
  window.__pantauSortableHeaders=true;
  const sync=th=>{th.tabIndex=0;th.setAttribute('aria-sort',th.classList.contains('is-sort-asc')?'ascending':th.classList.contains('is-sort-desc')?'descending':'none');};
  const scan=()=>document.querySelectorAll('th.column-sortable').forEach(sync);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan);else scan();
  new MutationObserver(records=>records.forEach(r=>{if(r.target.matches?.('th.column-sortable'))sync(r.target);})).observe(document.documentElement,{attributes:true,attributeFilter:['class'],subtree:true});
  document.addEventListener('keydown',e=>{const th=e.target.closest?.('th.column-sortable');if(th&&(e.key==='Enter'||e.key===' ')){e.preventDefault();th.click();}});
})();
