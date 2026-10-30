// Upload Excel per jenis (menu aktif): parse di server, tinjau & edit per sheet di spreadsheet, lalu simpan ke database.
const UPLOAD_FIELDS = [["kode_bu", "KODE BU", true], ["nama_bu", "NAMA BU", false], ["peserta", "Peserta", false], ["nominal", "Nominal", true]];
const NUMERIC_FIELDS = ["peserta", "nominal", "bulan_menunggak", "nominal_tagihan", "jumlah_bayar"];
// Per jenis: kolom jumlah di ringkasan (/summary), kunci baris, dan teks bantuan. Karyawan berformat tetap, jadi tanpa pemetaan kolom.
const UPLOAD_JENIS = {
    tagihan: { prefix: "tagihan", key: "kode_bu", keyLabel: "KODE BU", count: "Jumlah BU" },
    pembayaran: { prefix: "bayar", key: "kode_bu", keyLabel: "KODE BU", count: "Jumlah BU" },
    karyawan: {
        prefix: "karyawan", key: "noka_keluarga", keyLabel: "Noka Peserta/Keluarga", count: "Jumlah Peserta", fixed: true,
        bulk: "File dengan satu sheet per bulan. Bulan dibaca dari kolom Bulan Tagih (atau nama sheet); setiap bulan yang ada di file menjadi satu tab.",
        format: "Per sheet: Kode BU, Nama BU, Noka Peserta, ..., Bulan Tagih, lalu Tanggal Bayar dan Jumlah Bayar bulan itu (.xlsx)",
    },
};
const UPLOAD_DEFAULT_HINTS = {
    bulk: "File dengan satu sheet per bulan. Bulan dibaca dari nama sheet atau kolom Periode. Sheet kosong dilewati, jadi template satu tahun bisa diisi sebagian saja.",
    format: "Format kolom: NO, KODE BU, NAMA BU, Periode, Peserta, Nominal (.xlsx)",
};

function uploadFields() {
    return UPLOAD_JENIS[uploadJenis]?.fixed ? [] : UPLOAD_FIELDS;
}
// Kolom nominal di file rekap (Total Tagihan / Total Bayar) per jenis.
const REKAP_NOMINAL_FIELD = { tagihan: "tagihan", pembayaran: "bayar" };

let uploadSheets = [];
let uploadActive = 0;
let uploadGrid = null;
let uploadFileName = "";
let uploadJenis = "";          // jenis data file yang sedang ditinjau
// Upload per bulan: bulan terkunci untuk file yang sedang ditinjau; null = upload banyak bulan.
let uploadMonth = null;
let uploadPendingMonth = null;

function initUpload() {
    if (uploadJenis && uploadJenis !== activeAdminJenis) resetUpload();
    const config = UPLOAD_JENIS[activeAdminJenis];
    document.getElementById("uploadCountHeader").textContent = config.count;
    document.getElementById("uploadBulkHint").textContent = config.bulk || UPLOAD_DEFAULT_HINTS.bulk;
    document.getElementById("uploadFormatHint").textContent = config.format || UPLOAD_DEFAULT_HINTS.format;
    loadUploadMonths();
    redrawUploadGrid();
}

function resetUpload() {
    uploadSheets = [];
    uploadJenis = "";
    uploadMonth = null;
    document.getElementById("uploadReview").classList.add("hidden");
    document.getElementById("uploadFileName").textContent = "Pilih atau tarik file Excel ke sini";
}

async function loadUploadMonths() {
    const body = document.getElementById("uploadMonthBody");
    const jenis = activeAdminJenis;
    const prefix = UPLOAD_JENIS[jenis].prefix;
    try {
        const summary = await adminApi("/api/admin/summary");
        if (jenis !== activeAdminJenis) return;
        body.innerHTML = summary.per_bulan.map(m => {
            const rows = m[`${prefix}_rows`];
            return `<tr>
              <td class="font-semibold text-slate-900">${m.bulan} ${rows ? "" : '<span class="admin-pill admin-pill-empty">belum ada</span>'}</td>
              <td class="text-right">${formatNumber(rows)}</td>
              <td class="text-right">${formatRupiah(m[`${prefix}_total`])}</td>
              <td><div class="admin-row-actions">
                <button class="admin-btn admin-btn-ghost" type="button" onclick="openMonthUpload('${m.bulan}')"><i class="fa-solid fa-upload"></i><span>${rows ? "Ganti" : "Upload"}</span></button>
                <button class="admin-btn admin-btn-ghost" type="button" onclick="openWorkspaceMonth('${m.bulan}')" ${rows ? "" : "disabled"}><i class="fa-solid fa-table-cells"></i><span>Workspace</span></button>
              </div></td>
            </tr>`;
        }).join("");
    } catch (error) {
        body.innerHTML = `<tr><td class="admin-empty" colspan="4">Gagal memuat status bulan: ${escapeHtml(error.message)}</td></tr>`;
    }
}

async function downloadTemplate() {
    try {
        await adminDownload(`/api/admin/template?jenis=${activeAdminJenis}`);
    } catch (error) {
        showToast(`Gagal mengunduh template: ${error.message}`, "error");
    }
}

function openMonthUpload(bulan) {
    uploadPendingMonth = bulan;
    document.getElementById("uploadMonthFile").click();
}

// File per bulan: pakai sheet yang bulannya cocok (atau sheet pertama berisi data) sebagai bulan yang dipilih.
function applyUploadMonth() {
    if (!uploadMonth) return [];
    const match = uploadSheets.findIndex(sheet => sheet.bulan === uploadMonth && sheet.rows.length);
    const index = match >= 0 ? match : Math.max(0, uploadSheets.findIndex(sheet => sheet.rows.length));
    const detected = uploadSheets[index]?.bulan;
    uploadSheets.forEach((sheet, i) => { sheet.include = i === index; });
    if (uploadSheets[index]) uploadSheets[index].bulan = uploadMonth;
    uploadActive = index;
    return detected && detected !== uploadMonth ? [`Sheet ini terbaca sebagai ${detected}, akan disimpan sebagai ${uploadMonth}.`] : [];
}

function renderUploadTarget(warnings) {
    const label = ADMIN_JENIS[uploadJenis];
    const other = uploadSheets.find(sheet => sheet.jenis && sheet.jenis !== uploadJenis)?.jenis;
    if (other === "rekap") warnings.push(`File ini berformat rekap. Hanya kolom ${label} yang disimpan.`);
    else if (other) warnings.push(`Nama file menunjukkan data ${ADMIN_JENIS[other]}. Pastikan file yang dipilih benar.`);
    document.getElementById("uploadTargetInfo").innerHTML = `<i class="fa-solid fa-calendar-check"></i>
      <span>Upload <strong>${label}</strong> ${uploadMonth ? `bulan <strong>${uploadMonth}</strong>` : `dari <strong>${escapeHtml(uploadFileName)}</strong>`}${warnings.length ? `<br><span class="admin-upload-warning">${warnings.map(escapeHtml).join("<br>")}</span>` : ""}</span>`;
}

function initUploadDropzone() {
    const zone = document.getElementById("uploadDropzone");
    ["dragenter", "dragover"].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.add("is-dragging"); }));
    ["dragleave", "drop"].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.remove("is-dragging"); }));
    zone.addEventListener("drop", event => handleUploadFile(event.dataTransfer.files[0]));
}

async function handleUploadFile(file, month = null) {
    uploadPendingMonth = null;
    if (!file) return;
    const zone = document.getElementById("uploadDropzone");
    const label = document.getElementById("uploadFileName");
    zone.classList.add("is-loading");
    label.textContent = `Membaca ${file.name}...`;
    try {
        const form = new FormData();
        form.append("file", file);
        const query = new URLSearchParams({ jenis: activeAdminJenis, bulan: month || "" });
        const result = await adminApi(`/api/admin/upload?${query}`, { method: "POST", form });
        const rekapField = REKAP_NOMINAL_FIELD[activeAdminJenis];
        uploadFileName = result.filename;
        uploadJenis = activeAdminJenis;
        uploadMonth = month;
        uploadSheets = result.sheets.map(sheet => ({
            ...sheet,
            mapping: { nominal: sheet.mapping[rekapField], ...sheet.mapping },
            include: Boolean(sheet.bulan) && sheet.rows.length > 0,
            data: sheet.rows.map(row => Object.fromEntries(row.map((value, i) => [`c${i}`, value]))),
        }));
        uploadSheets.forEach(sheet => { if (sheet.mapping.nominal === undefined) delete sheet.mapping.nominal; });
        uploadActive = 0;
        renderUploadTarget(applyUploadMonth());
        label.textContent = month ? "Pilih atau tarik file Excel ke sini" : `${file.name} · ${uploadSheets.length} sheet`;
        document.getElementById("uploadReview").classList.remove("hidden");
        renderUploadSheet();
        document.getElementById("uploadReview").scrollIntoView({ behavior: "smooth", block: "start" });
        showToast(`File ${file.name} terbaca. Periksa data sebelum disimpan.`, "info");
    } catch (error) {
        label.textContent = "Pilih atau tarik file Excel ke sini";
        showToast(`Upload gagal: ${error.message}`, "error");
    } finally {
        zone.classList.remove("is-loading");
        document.getElementById("uploadFile").value = "";
        document.getElementById("uploadMonthFile").value = "";
    }
}

function persistUploadGrid() {
    if (uploadGrid && uploadSheets[uploadActive]) uploadSheets[uploadActive].data = uploadGrid.getData();
}

function selectUploadSheet(index) {
    persistUploadGrid();
    uploadActive = index;
    renderUploadSheet();
}

function toggleUploadSheet(index, checked) {
    if (uploadMonth) {
        // Upload per bulan hanya menyimpan satu sheet, sebagai bulan yang dipilih.
        uploadSheets.forEach((sheet, i) => { sheet.include = checked && i === index; });
        if (checked) uploadSheets[index].bulan = uploadMonth;
        return renderUploadSheet();
    }
    uploadSheets[index].include = checked;
    renderUploadTabs();
}

function renderUploadTabs() {
    document.getElementById("uploadSheetTabs").innerHTML = uploadSheets.map((sheet, i) => `
      <div class="admin-sheet-tab ${i === uploadActive ? "is-active" : ""}">
        <input type="checkbox" ${sheet.include ? "checked" : ""} title="Impor sheet ini" onchange="toggleUploadSheet(${i}, this.checked)"/>
        <span class="admin-sheet-tab-label" role="button" tabindex="0" onclick="selectUploadSheet(${i})" onkeydown="if(event.key==='Enter')selectUploadSheet(${i})">${escapeHtml(sheet.name)} <small>${sheet.bulan && sheet.bulan !== sheet.name ? `${sheet.bulan} · ` : sheet.bulan ? "" : "bulan? · "}${formatNumber(sheet.data.length)} baris</small></span>
      </div>`).join("");
    const chosen = uploadSheets.filter(sheet => sheet.include);
    document.getElementById("uploadSummary").textContent =
        `${chosen.length} sheet dipilih · ${formatNumber(chosen.reduce((sum, sheet) => sum + sheet.data.length, 0))} baris`;
}

function renderUploadMapping() {
    const sheet = uploadSheets[uploadActive];
    if (!sheet) return;
    const options = sheet.headers.map((header, i) => `<option value="${i}">${escapeHtml(header)}</option>`).join("");
    const monthOptions = MONTHS.map(month => `<option ${month === sheet.bulan ? "selected" : ""}>${month}</option>`).join("");
    document.getElementById("uploadMapping").innerHTML = `
      <label class="admin-field ${sheet.bulan ? "" : "is-missing"}"><span>Bulan sheet ini</span>
        <select class="admin-select" ${uploadMonth ? "disabled" : ""} onchange="setUploadMonth(this.value)"><option value="">Pilih bulan</option>${monthOptions}</select>
      </label>` + uploadFields().map(([field, label, required]) => {
        const missing = required && sheet.mapping[field] === undefined;
        return `<label class="admin-field ${missing ? "is-missing" : ""}"><span>Kolom ${label}${required ? " *" : ""}</span>
          <select class="admin-select" onchange="setUploadMapping('${field}', this.value)">
            <option value="">(tidak ada)</option>${options}
          </select></label>`;
    }).join("");
    document.querySelectorAll("#uploadMapping select[onchange^=setUploadMapping]").forEach((select, i) => {
        select.value = sheet.mapping[uploadFields()[i][0]] ?? "";
    });
}

function setUploadMonth(month) {
    uploadSheets[uploadActive].bulan = month || null;
    if (month) uploadSheets[uploadActive].include = true;
    renderUploadTabs();
    renderUploadMapping();
}

function setUploadMapping(field, value) {
    const sheet = uploadSheets[uploadActive];
    if (value === "") delete sheet.mapping[field];
    else sheet.mapping[field] = Number(value);
    persistUploadGrid();
    renderUploadSheet();
}

function uploadColumns(sheet) {
    const numericIndexes = new Set(NUMERIC_FIELDS.map(field => sheet.mapping[field]).filter(i => i !== undefined));
    return sheet.headers.map((header, i) => numericIndexes.has(i)
        ? numberColumn(header, `c${i}`)
        : { title: header, field: `c${i}`, widthGrow: i === sheet.mapping.nama_bu ? 3 : 1 });
}

function renderUploadSheet() {
    const sheet = uploadSheets[uploadActive];
    renderUploadTabs();
    renderUploadMapping();
    if (!sheet) return;
    if (!uploadGrid) {
        uploadGrid = createSpreadsheet("#uploadGrid", uploadColumns(sheet), sheet.data);
    } else {
        uploadGrid.setColumns(uploadColumns(sheet));
        uploadGrid.replaceData(sheet.data);
    }
}

function redrawUploadGrid() {
    if (uploadGrid) uploadGrid.redraw(true);
}

function buildImportRows(sheet, jenis) {
    const m = sheet.mapping;
    const get = (row, field) => m[field] === undefined ? null : row[`c${m[field]}`];
    const rows = [];
    let skipped = 0;
    for (const row of sheet.data) {
        const kode = String(get(row, UPLOAD_JENIS[jenis].key) ?? "").trim();
        if (!kode) { skipped++; continue; }
        if (jenis === "karyawan") {
            rows.push(Object.fromEntries(Object.keys(m).map(field => [field, get(row, field)])));
            continue;
        }
        rows.push({ kode_bu: kode, nama_bu: get(row, "nama_bu") ?? "", peserta: get(row, "peserta"), nominal: get(row, "nominal") });
    }
    return { rows, skipped };
}

async function saveUpload() {
    persistUploadGrid();
    const jenis = uploadJenis;
    const replace = document.getElementById("uploadReplace").checked;
    const chosen = uploadSheets.filter(sheet => sheet.include);
    if (!chosen.length) return showToast("Pilih minimal satu sheet untuk diimpor.", "error");
    const problems = chosen.flatMap(sheet => [
        !sheet.bulan && `Sheet ${sheet.name}: bulan belum dipilih.`,
        ...uploadFields().filter(([field, , required]) => required && sheet.mapping[field] === undefined)
            .map(([, label]) => `Sheet ${sheet.name}: kolom ${label} belum dipetakan.`),
    ]).filter(Boolean);
    const months = chosen.map(sheet => sheet.bulan);
    const duplicateMonth = months.find((month, i) => months.indexOf(month) !== i);
    if (duplicateMonth) problems.push(`Bulan ${duplicateMonth} dipilih di lebih dari satu sheet.`);
    if (problems.length) return showToast(problems.join("\n"), "error");

    const label = ADMIN_JENIS[jenis];
    const action = replace ? "Seluruh data" : "Data";
    const effect = replace ? "diganti dengan isi file" : "diperbarui sesuai isi file";
    if (!(await pantauConfirm({
        title: `Simpan ${label} ke database?`,
        message: `File: ${uploadFileName}\n${action} ${label.toLowerCase()} bulan ${months.join(", ")} akan ${effect}.`,
        confirmText: "Simpan",
        icon: "fa-database",
    }))) return;

    const button = document.getElementById("uploadSaveButton");
    button.disabled = true;
    const done = [];
    try {
        for (const sheet of chosen) {
            const { rows, skipped } = buildImportRows(sheet, jenis);
            const result = await adminApi("/api/admin/import", {
                method: "POST",
                body: { jenis, bulan: sheet.bulan, replace, source: `${uploadFileName} / ${sheet.name}`, rows },
            });
            done.push(`${sheet.bulan}: ${formatNumber(result.written)} baris${skipped ? ` (${skipped} baris tanpa ${UPLOAD_JENIS[jenis].keyLabel} dilewati)` : ""}`);
        }
        showToast(`${label} tersimpan ke database.\n${done.join("\n")}`, "success", 7000);
    } catch (error) {
        const prefix = done.length ? `Sebagian tersimpan (${done.join("; ")}).\n` : "";
        showToast(`${prefix}Gagal menyimpan: ${error.message}`, "error");
    } finally {
        button.disabled = false;
        if (done.length) loadUploadMonths();
    }
}
