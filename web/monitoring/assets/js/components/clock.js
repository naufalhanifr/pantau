// Jam dan tanggal real-time WIB di header.
function updatePantauClock() {
    const now = new Date();
    const dateText = new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta", weekday: "long", day: "2-digit",
        month: "long", year: "numeric"
    }).format(now);
    const timeText = new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit",
        second: "2-digit", hour12: false
    }).format(now).replace(/\./g, ":") + " WIB";
    ["clockDate", "clockDateMobile"].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = dateText;
    });
    ["clockTime", "clockTimeMobile"].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = timeText;
    });
}
updatePantauClock();
setInterval(updatePantauClock, 1000);
