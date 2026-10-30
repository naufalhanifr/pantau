// Global: setiap halaman & menu selalu dimulai dari atas; matikan pemulihan posisi scroll bawaan browser (reload/kembali).
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
window.addEventListener("pageshow", () => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
