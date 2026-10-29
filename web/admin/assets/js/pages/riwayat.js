// Riwayat upload dan penyimpanan workspace untuk jenis data menu aktif.
const JENIS_LABEL = { tagihan: "Tagihan", pembayaran: "Pembayaran", rekap: "Tagihan + Pembayaran" };

async function loadHistory() {
    const body = document.getElementById("historyBody");
    const jenis = activeAdminJenis;
    body.innerHTML = '<tr><td class="admin-empty" colspan="6">Memuat riwayat...</td></tr>';
    try {
        const { rows } = await adminApi(`/api/admin/history?jenis=${jenis}`);
        if (jenis !== activeAdminJenis) return;
        body.innerHTML = rows.length ? rows.map(row => `<tr>
              <td class="whitespace-nowrap">${escapeHtml(row.created_at)}</td>
              <td>${escapeHtml(row.source || "-")}</td>
              <td>${JENIS_LABEL[row.jenis] || escapeHtml(row.jenis || "-")}</td>
              <td>${escapeHtml(row.bulan || "-")}</td>
              <td class="text-right">${formatNumber(row.rows_written)}</td>
              <td class="text-right">${formatNumber(row.rows_deleted)}</td>
            </tr>`).join("")
            : '<tr><td class="admin-empty" colspan="6">Belum ada perubahan data.</td></tr>';
    } catch (error) {
        body.innerHTML = `<tr><td class="admin-empty" colspan="6">Gagal memuat riwayat: ${escapeHtml(error.message)}</td></tr>`;
    }
}
