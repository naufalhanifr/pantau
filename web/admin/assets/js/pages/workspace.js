// Workspace: edit data satu jenis (menu aktif) satu bulan seperti spreadsheet, lalu simpan selisihnya ke database.
const WS_FIELDS = ["kode_bu", "nama_bu", "peserta", "nominal"];
const WS_NUMBER_FIELDS = ["peserta", "nominal"];

let wsTable = null;
let wsJenis = "";
let wsMonth = "";
let wsRequestedMonth = "";    // bulan dari tombol Workspace di halaman upload
let wsOriginal = new Map();   // _id -> data saat dimuat dari database
let wsDeleted = new Set();    // KODE BU asli yang dihapus
let wsNextId = 0;
let wsStatusTimer = null;

function initWorkspace() {
    const select = document.getElementById("workspaceMonth");
    if (!select.options.length) select.innerHTML = MONTHS.map(month => `<option>${month}</option>`).join("");
    const month = wsRequestedMonth || wsMonth || select.value;
    wsRequestedMonth = "";
    if (!wsTable) {
        wsTable = createSpreadsheet("#workspaceGrid", workspaceColumns(), [], {
            index: "_id",
            rowFormatter: formatWorkspaceRow,
        });
        wsTable.on("cellEdited", cell => cell.getRow().reformat());
        wsTable.on("clipboardPasted", () => wsTable.getRows().forEach(row => row.reformat()));
        wsTable.on("dataChanged", scheduleWorkspaceStatus);
        wsTable.on("tableBuilt", () => loadWorkspace(month));
    } else {
        wsTable.redraw(true);
        markSpreadsheetIdle(wsTable);
        if (month !== wsMonth || wsJenis !== activeAdminJenis) loadWorkspace(month);
    }
}

function workspaceColumns() {
    return [
        { title: "Kode BU", field: "kode_bu", width: 120, frozen: true },
        { title: "Nama Badan Usaha", field: "nama_bu", widthGrow: 3, minWidth: 220 },
        numberColumn("Peserta", "peserta", { width: 130 }),
        numberColumn("Nominal", "nominal", { minWidth: 160 }),
    ];
}

function formatWorkspaceRow(row) {
    const data = row.getData();
    const original = wsOriginal.get(data._id);
    const element = row.getElement();
    element.classList.toggle("ws-row-new", !original);
    element.classList.toggle("ws-row-changed", Boolean(original) && isWorkspaceRowChanged(original, data));
    row.getCells().forEach(cell => cell.getElement().classList.toggle("ws-cell-invalid", cell.getField() === "kode_bu" && !String(data.kode_bu || "").trim()));
}

function isWorkspaceRowChanged(original, data) {
    return WS_FIELDS.some(field => String(original[field] ?? "") !== String(data[field] ?? ""));
}

async function loadWorkspace(month) {
    if (!month || !wsTable) return;
    wsJenis = activeAdminJenis;
    wsMonth = month;
    document.getElementById("workspaceMonth").value = month;
    document.getElementById("workspaceStatus").textContent = `Memuat ${ADMIN_JENIS[wsJenis]} ${month}...`;
    try {
        const { rows } = await adminApi(`/api/admin/records?jenis=${wsJenis}&bulan=${encodeURIComponent(month)}`);
        wsOriginal = new Map();
        wsDeleted = new Set();
        const data = rows.map(row => {
            const item = { _id: wsNextId++ };
            // Samakan dengan mutator kolom angka agar baris yang tidak disentuh tidak terhitung berubah.
            WS_FIELDS.forEach(field => { item[field] = WS_NUMBER_FIELDS.includes(field) ? parseAmount(row[field]) : row[field] ?? ""; });
            wsOriginal.set(item._id, { ...item });
            return item;
        });
        await wsTable.setData(data);
        updateWorkspaceStatus();
    } catch (error) {
        document.getElementById("workspaceStatus").textContent = `Gagal memuat data: ${error.message}`;
    }
}

async function changeWorkspaceMonth(month) {
    document.getElementById("workspaceMonth").value = wsMonth;
    if (hasUnsavedWorkspace() && !(await pantauConfirm({
        title: `Buka ${month} tanpa menyimpan?`, message: `Perubahan bulan ${wsMonth} belum disimpan dan akan hilang.`, tone: "danger", confirmText: "Buang perubahan", cancelText: "Tetap di sini",
    }))) return;
    loadWorkspace(month);
}

function openWorkspaceMonth(month) {
    wsRequestedMonth = month;
    showAdminPage("workspace");
}

function filterWorkspace(query) {
    const q = query.trim().toLocaleLowerCase("id-ID");
    if (!q) return wsTable.clearFilter();
    wsTable.setFilter(data => `${data.kode_bu} ${data.nama_bu}`.toLocaleLowerCase("id-ID").includes(q));
}

function addWorkspaceRow() {
    const id = wsNextId++;
    wsTable.addRow({ _id: id, kode_bu: "", nama_bu: "", peserta: 0, nominal: 0 }, true)
        .then(row => { row.scrollTo(); row.getCell("kode_bu").edit(); });
}

async function deleteWorkspaceRows() {
    const rows = hasSpreadsheetSelection(wsTable) ? [...new Set(wsTable.getRanges().flatMap(range => range.getRows()))] : [];
    if (!rows.length) return showToast("Pilih sel pada baris yang ingin dihapus terlebih dahulu.", "info");
    if (!(await pantauConfirm({
        title: `Hapus ${rows.length} baris?`,
        message: `Baris dihapus dari ${ADMIN_JENIS[wsJenis]} bulan ${wsMonth}. Database baru berubah setelah Simpan perubahan.`,
        confirmText: "Hapus baris", tone: "danger",
    }))) return;
    rows.forEach(row => {
        const original = wsOriginal.get(row.getData()._id);
        if (original) wsDeleted.add(original.kode_bu);
        row.delete();
    });
    updateWorkspaceStatus();
}

function workspaceChanges() {
    const upserts = [];
    const deletes = new Set(wsDeleted);
    for (const data of wsTable.getData()) {
        const original = wsOriginal.get(data._id);
        if (original && !isWorkspaceRowChanged(original, data)) continue;
        upserts.push(Object.fromEntries(WS_FIELDS.map(field => [field, data[field]])));
        if (original && original.kode_bu !== data.kode_bu) deletes.add(original.kode_bu);
    }
    return { upserts, deletes: [...deletes] };
}

function hasUnsavedWorkspace() {
    if (!wsTable || !wsMonth) return false;
    const { upserts, deletes } = workspaceChanges();
    return upserts.length > 0 || deletes.length > 0;
}

function scheduleWorkspaceStatus() {
    clearTimeout(wsStatusTimer);
    wsStatusTimer = setTimeout(updateWorkspaceStatus, 150);
}

function updateWorkspaceStatus() {
    const { upserts, deletes } = workspaceChanges();
    const changes = upserts.length + deletes.length;
    document.getElementById("workspaceStatus").textContent =
        `${ADMIN_JENIS[wsJenis]} ${wsMonth} · ${formatNumber(wsTable.getDataCount())} baris · ` +
        (changes ? `${upserts.length} baris diubah/ditambah, ${deletes.length} dihapus (belum disimpan)` : "tidak ada perubahan") +
        " · Klik dua kali untuk mengubah sel, salin/tempel seperti Excel.";
    document.getElementById("workspaceSaveButton").disabled = !changes;
    document.getElementById("workspaceResetButton").disabled = !changes;
}

async function resetWorkspace() {
    if (!(await pantauConfirm({
        title: "Batalkan semua perubahan?", message: "Data dimuat ulang dari database. Perubahan yang belum disimpan akan hilang.",
        confirmText: "Batalkan perubahan", cancelText: "Kembali", tone: "danger",
    }))) return;
    loadWorkspace(wsMonth);
}

async function saveWorkspace() {
    const { upserts, deletes } = workspaceChanges();
    const empty = upserts.filter(row => !String(row.kode_bu || "").trim()).length;
    if (empty) return showToast(`${empty} baris belum memiliki KODE BU.`, "error");
    const codes = wsTable.getData().map(row => String(row.kode_bu || "").trim());
    const duplicate = codes.find((code, i) => codes.indexOf(code) !== i);
    if (duplicate) return showToast(`KODE BU ${duplicate} muncul lebih dari sekali.`, "error");
    if (!(await pantauConfirm({
        title: `Simpan ${ADMIN_JENIS[wsJenis]} ${wsMonth}?`,
        message: `${upserts.length} baris diubah/ditambah dan ${deletes.length} baris dihapus akan disimpan ke database.`,
        confirmText: "Simpan", icon: "fa-floppy-disk",
    }))) return;

    const button = document.getElementById("workspaceSaveButton");
    button.disabled = true;
    try {
        const result = await adminApi("/api/admin/records", { method: "PUT", body: { jenis: wsJenis, bulan: wsMonth, upserts, deletes } });
        showToast(`Perubahan ${ADMIN_JENIS[wsJenis]} ${wsMonth} tersimpan: ${formatNumber(result.written)} baris disimpan, ${formatNumber(result.deleted)} baris dihapus.`);
        await loadWorkspace(wsMonth);
    } catch (error) {
        showToast(`Gagal menyimpan: ${error.message}`, "error");
        updateWorkspaceStatus();
    }
}

window.addEventListener("beforeunload", event => {
    if (hasUnsavedWorkspace()) event.preventDefault();
});
