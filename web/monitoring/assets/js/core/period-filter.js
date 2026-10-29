// Filter rentang bulan bersama (Dashboard & Daftar Badan Usaha).
function configureAvailableMonthOptions() {
    const availableThroughMonth = 9;
    const now = new Date();
    const currentMonth = now.getFullYear() === 2026 ? now.getMonth() + 1 : 12;
    const maxSelectableMonth = Math.min(availableThroughMonth, currentMonth);
    ["globalStartMonth", "globalMonth", "monitorStartMonth", "monitorEndMonth"].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        Array.from(select.options).forEach(option => {
            const month = Number(option.value);
            option.disabled = month > maxSelectableMonth;
        });
    });
    // Default rentang: Januari sampai bulan terakhir yang tersedia pada data.
    ["globalStartMonth", "monitorStartMonth"].forEach(id => {
        const select = document.getElementById(id);
        if (select) select.value = "1";
    });
    ["globalMonth", "monitorEndMonth"].forEach(id => {
        const select = document.getElementById(id);
        if (select) select.value = String(maxSelectableMonth);
    });
}

function selectedFilters(menu = activePage) {
    // Setiap menu membaca kontrolnya sendiri, tanpa mengubah nilai menu lain.
    const monitoring = menu === "monitoring";
    const startControl = document.getElementById(monitoring ? "monitorStartMonth" : "globalStartMonth");
    const endControl = document.getElementById(monitoring ? "monitorEndMonth" : "globalMonth");
    const searchControl = document.getElementById(monitoring ? "searchInput" : "globalSearch");
    const startMonth = startControl?.value || "1";
    const month = endControl?.value || "9";
    const year = "2026";
    const search = (searchControl?.value || "").trim();
    return { startMonth, month, year, search };
}
