// Workspace: edit data satu jenis (menu aktif) satu bulan seperti spreadsheet, lalu simpan selisihnya ke database.
// Per jenis: kolom grid, kolom angka, dan kunci baris (dipakai untuk hapus & cek duplikat).
const WS_BU = {
    key: "kode_bu", keyLabel: "KODE BU", numbers: ["peserta", "nominal"],
    columns: [
        { title: "Kode BU", field: "kode_bu", width: 120, frozen: true },
        { title: "Nama Badan Usaha", field: "nama_bu", widthGrow: 3, minWidth: 220 },
        numberColumn("Peserta", "peserta", { width: 130 }),
        numberColumn("Nominal", "nominal", { minWidth: 160 }),
    ],
};
const WS_KARYAWAN = {
    key: "noka_keluarga", keyLabel: "Noka Peserta/Keluarga", numbers: ["bulan_menunggak", "nominal_tagihan", "jumlah_bayar"],
    columns: [
        { title: "Nama Peserta", field: "nama_peserta", minWidth: 200, frozen: true },
        { title: "Noka Peserta", field: "noka_peserta", width: 150 },
        { title: "Nama Peserta/Keluarga", field: "nama_keluarga", minWidth: 200 },
        { title: "Noka Peserta/Keluarga", field: "noka_keluarga", width: 170 },
        { title: "Pisapst", field: "status", width: 110 },
        { title: "Kode BU", field: "kode_bu", width: 110 },
        { title: "Nama BU", field: "nama_bu", minWidth: 220 },
        numberColumn("Bulan Menunggak", "bulan_menunggak", { width: 140 }),
        numberColumn("Jumlah Bayar (0 + tanggal kosong = belum bayar)", "jumlah_bayar", { width: 280 }),
        { title: "Tanggal Bayar (dd/mm/yyyy)", field: "tanggal_bayar", width: 170 },
        numberColumn("Sisa Tagihan Aktif", "nominal_tagihan", { width: 160 }),
        // Ikut dikirim saat simpan; tanpa kolom ini server mengganti "Januari 2026" menjadi "Januari".
        { title: "Bulan Tagih", field: "periode", width: 140 },
    ],
};

function wsSchema(jenis = wsJenis) {
    return jenis === "karyawan" ? WS_KARYAWAN : WS_BU;
}

function wsFields() {
    return wsSchema().columns.map(column => column.field);
}

let wsTable = null;
let wsJenis = "";
let wsMonth = "";
let wsRequestedMonth = "";    // bulan dari tombol Workspace di halaman upload
let wsOriginal = new Map();   // _id -> data saat dimuat dari database
let wsDeleted = new Set();    // KODE BU asli yang dihapus
let wsNextId = 0;
let wsStatusTimer = null;

async function initWorkspace() {
    const select = document.getElementById("workspaceMonth");
    const jenis = activeAdminJenis;
    // Hanya bulan yang sudah diupload; bulan baru masuk lewat menu Upload Excel.
    const uploaded = await uploadedMonths(jenis);
    if (jenis !== activeAdminJenis) return;
    select.innerHTML = uploaded.map(month => `<option>${month}</option>`).join("");
    // Bulan awal: dari tombol Workspace di Upload, bulan terakhir dibuka di menu yang sama, atau bulan terakhir yang sudah diupload.
    let month = wsRequestedMonth || (wsJenis === jenis ? wsMonth : "");
    wsRequestedMonth = "";
    if (!uploaded.includes(month)) month = uploaded.at(-1) || "";
    select.value = month;
    if (!wsTable) {
        wsTable = createSpreadsheet("#workspaceGrid", wsSchema(activeAdminJenis).columns, [], {
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

async function uploadedMonths(jenis) {
    try {
        const { per_bulan } = await adminApi("/api/admin/summary");
        return per_bulan.filter(m => m[`${UPLOAD_JENIS[jenis].prefix}_rows`]).map(m => m.bulan);
    } catch (error) {
        showToast(`Gagal memuat daftar bulan: ${error.message}`, "error");
        return [];
    }
}

function formatWorkspaceRow(row) {
    const data = row.getData();
    const original = wsOriginal.get(data._id);
    const element = row.getElement();
    element.classList.toggle("ws-row-new", !original);
    element.classList.toggle("ws-row-changed", Boolean(original) && isWorkspaceRowChanged(original, data));
    const { key, numbers } = wsSchema();
    // Kolom angka: bukan angka atau negatif (server akan menolaknya). Kolom kunci: kosong.
    row.getCells().forEach(cell => {
        const field = cell.getField();
        const invalid = numbers.includes(field) ? typeof data[field] !== "number" || data[field] < 0 : field === key && !String(data[key] || "").trim();
        cell.getElement().classList.toggle("ws-cell-invalid", invalid);
    });
}

function isWorkspaceRowChanged(original, data) {
    return wsFields().some(field => String(original[field] ?? "") !== String(data[field] ?? ""));
}

async function loadWorkspace(month) {
    if (!wsTable) return;
    if (wsJenis !== activeAdminJenis) wsTable.setColumns(wsSchema(activeAdminJenis).columns);
    wsJenis = activeAdminJenis;
    wsMonth = month;
    document.getElementById("workspaceMonth").value = month;
    document.getElementById("workspaceStatus").textContent = `Memuat ${ADMIN_JENIS[wsJenis]} ${month}...`;
    try {
        const { rows } = month ? await adminApi(`/api/admin/records?jenis=${wsJenis}&bulan=${encodeURIComponent(month)}`) : { rows: [] };
        wsOriginal = new Map();
        wsDeleted = new Set();
        const data = rows.map(row => {
            const item = { _id: wsNextId++ };
            // Samakan dengan mutator kolom angka agar baris yang tidak disentuh tidak terhitung berubah.
            wsFields().forEach(field => { item[field] = wsSchema().numbers.includes(field) ? parseAmount(row[field]) : row[field] ?? ""; });
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
    const fields = wsFields();
    wsTable.setFilter(data => fields.map(field => data[field]).join(" ").toLocaleLowerCase("id-ID").includes(q));
}

function addWorkspaceRow() {
    if (!wsMonth) return showToast(`Belum ada data ${ADMIN_JENIS[wsJenis]}. Upload dulu lewat menu Upload Excel.`, "info");
    const id = wsNextId++;
    const { key, numbers } = wsSchema();
    wsTable.addRow({ _id: id, ...Object.fromEntries(wsFields().map(field => [field, numbers.includes(field) ? 0 : ""])) }, true)
        .then(row => { row.scrollTo(); row.getCell(key).edit(); });
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
        if (original) wsDeleted.add(original[wsSchema().key]);
        row.delete();
    });
    updateWorkspaceStatus();
}

function workspaceChanges() {
    const upserts = [];
    const deletes = new Set(wsDeleted);
    const fields = wsFields();
    const key = wsSchema().key;
    for (const data of wsTable.getData()) {
        const original = wsOriginal.get(data._id);
        if (original && !isWorkspaceRowChanged(original, data)) continue;
        upserts.push(Object.fromEntries(fields.map(field => [field, data[field]])));
        if (original && original[key] !== data[key]) deletes.add(original[key]);
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
    document.getElementById("workspaceStatus").textContent = !wsMonth ? `Belum ada data ${ADMIN_JENIS[wsJenis]}. Upload dulu lewat menu Upload Excel.` :
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
    const { key, keyLabel } = wsSchema();
    const empty = upserts.filter(row => !String(row[key] || "").trim()).length;
    if (empty) return showToast(`${empty} baris belum memiliki ${keyLabel}.`, "error");
    // Set, bukan indexOf: workspace karyawan berisi ±20 ribu baris per bulan.
    const seen = new Set();
    const duplicate = wsTable.getData().map(row => String(row[key] || "").trim()).find(code => {
        if (seen.has(code)) return true;
        seen.add(code);
        return false;
    });
    if (duplicate) return showToast(`${keyLabel} ${duplicate} muncul lebih dari sekali.`, "error");
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
