// Design system: semua <select> global ditampilkan dengan daftar opsi PANTAU (monitoring + admin).
(function(){
  if(window.__pantauGlobalSelectListsInstalled) return;
  window.__pantauGlobalSelectListsInstalled=true;
  const excluded = sel => sel.closest('#employeeFilters') || sel.classList.contains('employee-hidden-select') || sel.id==='employeeStatusFilter' || sel.id==='employeePageSize';
  function enhanceSelect(select){
    if(!select || excluded(select) || select.dataset.pantauListEnhanced==='1' || !select.parentNode) return;
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
    const menu=document.createElement('div'); menu.className='pantau-native-select-menu pantau-dropdown-list hidden'; menu.setAttribute('role','listbox');
    menu.setAttribute('aria-label',select.getAttribute('aria-label') || select.id || 'Pilihan');
    function render(){
      const current=select.options[select.selectedIndex]; label.textContent=current?current.textContent.trim():''; trigger.disabled=select.disabled;
      menu.innerHTML='';
      Array.from(select.options).forEach((opt)=>{
        const b=document.createElement('button'); b.type='button'; b.className='pantau-dropdown-option'; b.setAttribute('role','option'); b.setAttribute('aria-selected',opt.value===select.value?'true':'false'); b.textContent=opt.textContent.trim(); b.disabled=opt.disabled;
        if(opt.value===select.value){const check=document.createElement('i');check.className='fa-solid fa-check';check.setAttribute('aria-hidden','true');b.appendChild(check);}
        b.addEventListener('click',()=>{if(opt.disabled)return;select.value=opt.value;select.dispatchEvent(new Event('change',{bubbles:true}));render();close();});
        menu.appendChild(b);
      });
    }
    function positionMenu(){const r=trigger.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(r.left,window.innerWidth-r.width-8))+'px';menu.style.width=r.width+'px';menu.style.top=Math.min(r.bottom+6,Math.max(8,window.innerHeight-menu.offsetHeight-8))+'px';}
    function close(){menu.classList.add('hidden');trigger.setAttribute('aria-expanded','false');window.__pantauDropdownIndicatorRefresh&&window.__pantauDropdownIndicatorRefresh();}
    trigger.addEventListener('click',()=>{const opening=menu.classList.contains('hidden');document.querySelectorAll('.pantau-native-select-menu').forEach(m=>m.classList.add('hidden'));document.querySelectorAll('.pantau-native-select-trigger').forEach(t=>t.setAttribute('aria-expanded','false'));if(opening){render();document.body.appendChild(menu);menu.classList.remove('hidden');positionMenu();trigger.setAttribute('aria-expanded','true');window.__pantauDropdownIndicatorRefresh&&window.__pantauDropdownIndicatorRefresh();}});
    window.addEventListener('resize',()=>{if(!menu.classList.contains('hidden'))positionMenu();});
    window.addEventListener('scroll',()=>{if(!menu.classList.contains('hidden'))positionMenu();},true);
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
