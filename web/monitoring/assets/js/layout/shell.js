// Samakan offset sidebar dengan tinggi header aktual.
// Match sidebar top exactly to the header; remove the artificial gap before the footer.
function syncPantauShellHeights() {
  const header = document.getElementById('appHeader');
  if (header) document.documentElement.style.setProperty('--pantau-header-height', `${Math.ceil(header.getBoundingClientRect().height)}px`);
}
window.addEventListener('load', syncPantauShellHeights);
window.addEventListener('resize', syncPantauShellHeights);
