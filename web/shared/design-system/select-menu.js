// Design system: semua <select> global ditampilkan dengan daftar opsi PANTAU (monitoring + admin).
(function(){
  if(window.__pantauGlobalSelectListsInstalled) return;
  window.__pantauGlobalSelectListsInstalled=true;
  function enhanceSelect(select){
    if(!select || select.dataset.pantauListEnhanced==='1' || !select.parentNode) return;
    select.dataset.pantauListEnhanced='1';
    const parent=select.parentNode;
    const wrap=document.createElement('div'); wrap.className='pantau-native-select-wrap';
    const computed=getComputedStyle(select);
    wrap.style.width=computed.width==='auto'?'100%':computed.width;
    wrap.style.minWidth='0';
    parent.insertBefore(wrap,select); wrap.appendChild(select);
    select.classList.add('pantau-native-select-hidden');
    const trigger=document.createElement('button'); trigger.type='button'; trigger.className='pantau-native-select-trigger'; trigger.setAttribute('aria-haspopup','listbox'); trigger.setAttribute('aria-expanded','false');
    const label=document.createElement('span'); label.className='pantau-native-select-label';
    const chevron=document.createElement('i'); chevron.className='fa-solid fa-chevron-down pantau-native-select-chevron'; chevron.setAttribute('aria-hidden','true');
    trigger.append(label,chevron);
    // Varian dengan header: screen reader membaca "Dari bulan, Januari", bukan hanya nilainya.
    const header=select.closest('.pantau-select-field')?.querySelector('.pantau-select-field-label');
    if(header){header.id||=`pantau-select-header-${Math.random().toString(36).slice(2)}`;label.id=`${header.id}-value`;trigger.setAttribute('aria-labelledby',`${header.id} ${label.id}`);}
    const menu=document.createElement('div'); menu.className='pantau-native-select-menu pantau-dropdown-list hidden'; menu.setAttribute('role','listbox');
    menu.setAttribute('aria-label',select.getAttribute('aria-label') || select.id || 'Pilihan');
    function render(){
      const current=select.options[select.selectedIndex]; label.textContent=current?current.textContent.trim():''; trigger.disabled=select.disabled;
      menu.innerHTML='';
      Array.from(select.options).forEach((opt)=>{
        const b=document.createElement('button'); b.type='button'; b.className='pantau-dropdown-option'; b.setAttribute('role','option'); b.setAttribute('aria-selected',opt.value===select.value?'true':'false'); b.textContent=opt.textContent.trim(); b.disabled=opt.disabled;
        if(opt.value===select.value){const check=document.createElement('i');check.className='fa-solid fa-check';check.setAttribute('aria-hidden','true');b.appendChild(check);}
        b.addEventListener('click',()=>{if(opt.disabled)return;select.value=opt.value;select.dispatchEvent(new Event('change',{bubbles:true}));render();close();trigger.focus();});
        menu.appendChild(b);
      });
    }
    function close(){menu.classList.add('hidden');trigger.setAttribute('aria-expanded','false');}
    trigger.addEventListener('click',()=>{const opening=menu.classList.contains('hidden');document.querySelectorAll('.pantau-native-select-menu').forEach(m=>m.classList.add('hidden'));document.querySelectorAll('.pantau-native-select-trigger').forEach(t=>t.setAttribute('aria-expanded','false'));if(opening){render();document.body.appendChild(menu);menu.classList.remove('hidden');window.pantauPlaceDropdown(trigger,menu);trigger.setAttribute('aria-expanded','true');(menu.querySelector('[aria-selected="true"]:not(:disabled)')||menu.querySelector('button:not(:disabled)'))?.focus();}});
    // Panah atas/bawah pindah antar opsi; Esc atau Tab menutup daftar dan fokus kembali ke tombol.
    menu.addEventListener('keydown',e=>{const opts=[...menu.querySelectorAll('button:not(:disabled)')];const i=opts.indexOf(document.activeElement);
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();opts[(i+(e.key==='ArrowDown'?1:-1)+opts.length)%opts.length]?.focus();}
      else if(e.key==='Home'||e.key==='End'){e.preventDefault();opts[e.key==='Home'?0:opts.length-1]?.focus();}
      else if(e.key==='Escape'||e.key==='Tab'){e.preventDefault();e.stopPropagation();close();trigger.focus();}});
    select.addEventListener('change',render);
    // shortcut: menu & listener dari select yang dihapus dari DOM tidak dibersihkan; cukup selama select jarang dibuat ulang, tambahkan cleanup jika halaman sering me-render ulang select.
    // select.value = ... dari kode tidak memicu event change; label tetap harus ikut berubah.
    const valueProp=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value');
    Object.defineProperty(select,'value',{configurable:true,get(){return valueProp.get.call(this);},set(v){valueProp.set.call(this,v);render();}});
    wrap.append(trigger); document.body.appendChild(menu); render();
    const observer=new MutationObserver(render);observer.observe(select,{attributes:true,childList:true,subtree:true});
  }
  function scan(root=document){root.querySelectorAll('select').forEach(enhanceSelect);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>scan());else scan();
  new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(n=>{if(n.nodeType===1){if(n.matches?.('select'))enhanceSelect(n);scan(n);}}))).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',e=>{if(!e.target.closest('.pantau-native-select-wrap')){document.querySelectorAll('.pantau-native-select-menu').forEach(m=>m.classList.add('hidden'));document.querySelectorAll('.pantau-native-select-trigger').forEach(t=>t.setAttribute('aria-expanded','false'));}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.querySelectorAll('.pantau-native-select-menu').forEach(m=>m.classList.add('hidden'));document.querySelectorAll('.pantau-native-select-trigger').forEach(t=>t.setAttribute('aria-expanded','false'));}});
})();
