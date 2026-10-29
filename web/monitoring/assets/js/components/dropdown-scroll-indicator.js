// Design system: indikator scroll yang selalu terlihat pada daftar dropdown.
(function(){
  if(window.__pantauDropdownScrollIndicators) return;
  window.__pantauDropdownScrollIndicators=true;
  const selector='.pantau-dropdown-list';
  const records=new Map();
  function attach(el){
    if(records.has(el)) return;
    const rail=document.createElement('div'); rail.className='pantau-dropdown-scroll-indicator';
    const thumb=document.createElement('div'); thumb.className='pantau-dropdown-scroll-indicator-thumb'; rail.appendChild(thumb); document.body.appendChild(rail);
    const rec={rail,thumb}; records.set(el,rec);
    el.addEventListener('scroll',()=>update(el),{passive:true});
    if(window.ResizeObserver){const ro=new ResizeObserver(()=>update(el));ro.observe(el);rec.ro=ro;}
    if(window.MutationObserver){const mo=new MutationObserver(()=>update(el));mo.observe(el,{childList:true,subtree:true,attributes:true,characterData:true});rec.mo=mo;}
    update(el);
  }
  function update(el){
    const rec=records.get(el); if(!rec) return;
    const r=el.getBoundingClientRect(), max=el.scrollHeight-el.clientHeight;
    const style=getComputedStyle(el);
    const visible=!!(el.isConnected && !el.classList.contains('hidden') && style.display!=='none' && style.visibility!=='hidden' && r.width>0 && r.height>0 && el.clientHeight>0 && max>2 && /(auto|scroll|overlay)/.test(style.overflowY));
    if(!visible){rec.rail.style.display='none';return;}
    const inset=4, railHeight=Math.max(12,r.height-inset*2), h=Math.max(22,railHeight*(el.clientHeight/el.scrollHeight));
    const travel=Math.max(0,railHeight-h);
    rec.rail.style.display='block'; rec.rail.style.left=(r.right-10)+'px'; rec.rail.style.top=(r.top+inset)+'px'; rec.rail.style.height=railHeight+'px';
    rec.thumb.style.height=Math.min(railHeight,h)+'px'; rec.thumb.style.transform='translateY('+(max>0?travel*el.scrollTop/max:0)+'px)';
  }
  function scan(root=document){if(root.nodeType===1 && root.matches && root.matches(selector))attach(root);if(root.querySelectorAll)root.querySelectorAll(selector).forEach(attach);}
  function refresh(){scan();for(const el of records.keys()){if(!el.isConnected){const r=records.get(el);r.rail.remove();r.ro&&r.ro.disconnect();r.mo&&r.mo.disconnect();records.delete(el);}else update(el);}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh);else refresh();
  new MutationObserver(()=>refresh()).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
  document.addEventListener('click',()=>requestAnimationFrame(refresh),true);
  window.addEventListener('scroll',refresh,true); window.addEventListener('resize',refresh);
  window.__pantauDropdownIndicatorRefresh=refresh;
})();
