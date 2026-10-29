// Daftar Karyawan: layar kata sandi + logout otomatis setelah 30 menit tidak aktif.
(function(){
  const PASSWORD = 'PantauBPJs';
  const KEY = 'pantauEmployeeAuthenticated';
  const IDLE_LIMIT = 30 * 60 * 1000;
  let idleTimer = null;
  let lastActivity = 0;
  function logoutEmployeeForIdle(){
    if(sessionStorage.getItem(KEY)!=='1') return;
    sessionStorage.removeItem(KEY);
    if(idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    const panel=document.getElementById('employeeLoginPanel');
    const content=document.getElementById('employeesProtectedContent');
    if(panel) panel.classList.remove('hidden');
    if(content) content.classList.add('hidden');
    const input=document.getElementById('employeeLoginPassword');
    if(input) input.value='';
  }
  function resetEmployeeIdleTimer(){
    if(sessionStorage.getItem(KEY)!=='1') return;
    lastActivity=Date.now();
    if(idleTimer) clearTimeout(idleTimer);
    idleTimer=setTimeout(logoutEmployeeForIdle, IDLE_LIMIT);
  }
  function startEmployeeIdleTracking(){
    ['pointerdown','pointermove','keydown','scroll','touchstart','click'].forEach(type=>document.addEventListener(type,resetEmployeeIdleTimer,{passive:true}));
    document.addEventListener('visibilitychange',function(){
      if(document.visibilityState==='visible' && sessionStorage.getItem(KEY)==='1'){
        if(lastActivity && Date.now()-lastActivity>=IDLE_LIMIT) logoutEmployeeForIdle();
        else resetEmployeeIdleTimer();
      }
    });
  }
  startEmployeeIdleTracking();
  window.employeeDemoLogin = function(event){
    if(event) event.preventDefault();
    const input=document.getElementById('employeeLoginPassword');
    const error=document.getElementById('employeeLoginError');
    if(input && input.value === PASSWORD){
      sessionStorage.setItem(KEY,'1');
      resetEmployeeIdleTimer();
      input.value='';
      if(error) error.classList.add('hidden');
      const panel=document.getElementById('employeeLoginPanel');
      const content=document.getElementById('employeesProtectedContent');
      if(panel) panel.classList.add('hidden');
      if(content) content.classList.remove('hidden');
      if(typeof renderEmployeeTable==='function') renderEmployeeTable();
      return false;
    }
    if(error) error.classList.remove('hidden');
    if(input){input.value='';input.focus();}
    return false;
  };
  window.toggleEmployeePassword = function(){
    const input=document.getElementById('employeeLoginPassword');
    const eye=document.getElementById('employeePasswordEye');
    if(!input)return;
    const show=input.type==='password'; input.type=show?'text':'password';
    if(eye){eye.classList.toggle('fa-eye',!show);eye.classList.toggle('fa-eye-slash',show);}
  };
  document.addEventListener('DOMContentLoaded',function(){
    const authed=sessionStorage.getItem(KEY)==='1';
    const panel=document.getElementById('employeeLoginPanel');
    const content=document.getElementById('employeesProtectedContent');
    if(panel) panel.classList.toggle('hidden',authed);
    if(content) content.classList.toggle('hidden',!authed);
  });
})();
