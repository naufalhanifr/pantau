// Filter rentang bulan bersama (Dashboard & Daftar Badan Usaha). Opsi & nilai awal diatur data.js dari bulan yang ada datanya.
function selectedFilters(menu = activePage) {
    // Setiap menu membaca kontrolnya sendiri, tanpa mengubah nilai menu lain.
    const monitoring = menu === "monitoring";
    const startControl = document.getElementById(monitoring ? "monitorStartMonth" : "globalStartMonth");
    const endControl = document.getElementById(monitoring ? "monitorEndMonth" : "globalMonth");
    const searchControl = document.getElementById(monitoring ? "searchInput" : "globalSearch");
    const startMonth = startControl?.value || "1";
    const month = endControl?.value || String(PANTAU_LATEST_MONTH || 12);
    const year = String(PANTAU_YEAR);
    const search = (searchControl?.value || "").trim();
    return { startMonth, month, year, search };
}
