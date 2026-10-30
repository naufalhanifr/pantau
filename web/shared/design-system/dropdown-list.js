// Design system: posisi list dropdown (.pantau-dropdown-list) terhadap pemicunya.
// pantauPlaceDropdown(anchor, list): muncul di bawah anchor jika ruangnya cukup, jika tidak di atas.
// Posisi fixed agar tidak terpotong card ber-overflow hidden; ikut diperbarui saat scroll/resize.
(function(){
  if(window.pantauPlaceDropdown) return;
  const GAP=6, EDGE=8, anchors=new Map();
  function place(anchor,list){
    anchors.set(list,anchor);
    const r=anchor.getBoundingClientRect();
    Object.assign(list.style,{position:'fixed',right:'auto',bottom:'auto',maxHeight:'',width:r.width+'px',left:Math.max(EDGE,Math.min(r.left,window.innerWidth-r.width-EDGE))+'px'});
    const below=window.innerHeight-r.bottom-GAP-EDGE, above=r.top-GAP-EDGE, height=list.offsetHeight;
    const up=height>below && above>below;
    const room=up?above:below;
    if(height>room) list.style.maxHeight=Math.max(0,room)+'px';
    list.style.top=(up?r.top-GAP-Math.min(height,room):r.bottom+GAP)+'px';
    list.dataset.placement=up?'top':'bottom';
  }
  function refresh(){
    anchors.forEach((anchor,list)=>{
      if(!anchor.isConnected || !list.isConnected) anchors.delete(list);
      else if(!list.classList.contains('hidden')) place(anchor,list);
    });
  }
  window.addEventListener('resize',refresh);
  window.addEventListener('scroll',refresh,true);
  window.pantauPlaceDropdown=place;
})();
