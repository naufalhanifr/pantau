// Design system: perilaku kerangka aplikasi (app-shell.css).
// Jam WIB ([data-pantau-clock="date"|"time"]), ciutkan sidebar (toggleSidebar), dan tinggi header untuk posisi sidebar.
(function(){
  const dateFormat=new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  const timeFormat=new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  function updateClock(){
    const now=new Date(), date=dateFormat.format(now), time=timeFormat.format(now).replace(/\./g,':')+' WIB';
    document.querySelectorAll('[data-pantau-clock="date"]').forEach(el=>{el.textContent=date;});
    document.querySelectorAll('[data-pantau-clock="time"]').forEach(el=>{el.textContent=time;});
  }
  // Sidebar menempel tepat di bawah header, yang tingginya berubah di HP (header bertumpuk).
  function syncHeaderHeight(){
    const header=document.querySelector('.pantau-header');
    const height=header && Math.ceil(header.getBoundingClientRect().height);
    if(height) document.documentElement.style.setProperty('--pantau-header-height',height+'px');
  }
  window.toggleSidebar=function(){
    const sidebar=document.querySelector('.pantau-sidebar'); if(!sidebar) return;
    const collapsed=sidebar.classList.toggle('is-collapsed');
    const toggle=sidebar.querySelector('.pantau-sidebar-toggle'); if(!toggle) return;
    toggle.setAttribute('aria-label',collapsed?'Perluas sidebar':'Ciutkan sidebar');
    toggle.setAttribute('aria-expanded',String(!collapsed));
    const icon=toggle.querySelector('i'); if(icon) icon.className='fa-solid '+(collapsed?'fa-angles-right':'fa-angles-left');
  };
  updateClock(); setInterval(updateClock,1000);
  syncHeaderHeight();
  window.addEventListener('load',syncHeaderHeight);
  window.addEventListener('resize',syncHeaderHeight);
  // Admin menampilkan header setelah login: ukur ulang saat header mulai terlihat.
  const header=document.querySelector('.pantau-header');
  if(header && window.ResizeObserver) new ResizeObserver(syncHeaderHeight).observe(header);
})();
