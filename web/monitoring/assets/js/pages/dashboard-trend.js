// Dashboard: grafik tren sisa tagihan, tagihan, dan pembayaran.
const TREND_EMPTY_TEXT = "Belum ada data pada rentang bulan ini.";
let trendHasData = false;

// Bulan pada grafik: rentang filter, dibatasi bulan terakhir yang tersedia di database.
function trendRange() {
    const f = selectedFilters("dashboard");
    const year = Number(f.year);
    const selectedMonth = Math.min(12, Math.max(1, Number(f.month) || PANTAU_LATEST_MONTH || 12));
    const start = Math.min(selectedMonth, Math.max(1, Number(f.startMonth) || selectedMonth));
    const latestAvailableMonth = year === PANTAU_YEAR ? PANTAU_LATEST_MONTH : 0;
    const end = Math.min(selectedMonth, latestAvailableMonth);
    return { year, search: f.search, selectedMonth, latestAvailableMonth, start, end, months: end >= start ? MONTHS.slice(start - 1, end) : [] };
}

function syncTrendModeDisabledState(hasData) {
    document.querySelectorAll("[data-trend-mode]").forEach(button => {
        button.disabled = !hasData;
        button.setAttribute("aria-disabled", hasData ? "false" : "true");
        button.title = hasData ? "" : TREND_EMPTY_TEXT;
    });
}

function setTrendMode(mode) {
    // Klik tidak boleh mengganti mode saat filter tidak menghasilkan data, walau tombol dipaksa aktif.
    if (!trendHasData) return;
    trendMode = ["sisa", "tagihan", "pembayaran"].includes(mode) ? mode : "sisa";
    document.querySelectorAll("[data-trend-mode]").forEach(button => {
        const active = button.dataset.trendMode === trendMode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    renderTrendChart();
}

function renderTrendChart() {
    const canvas = document.getElementById("chartTrend");
    if (!canvas) return;
    if (chartTrendInstance) chartTrendInstance.destroy();
    const { year, search, selectedMonth, latestAvailableMonth, start, end, months } = trendRange();
    const totals = months.map((_, idx) => {
        const rows = getDemoRows(start + idx, year, search);
        if (!rows.length) return {tagihan: null, bayar: null, sisa: null};
        const tagihan = rows.reduce((sum, r) => sum + Number(r.tagihan || 0), 0);
        const bayar = rows.reduce((sum, r) => sum + Number(r.bayar || 0), 0);
        return {tagihan, bayar, sisa: Math.max(0, tagihan - bayar)};
    });
    trendHasData = totals.some(t => t.tagihan !== null);
    syncTrendModeDisabledState(trendHasData);

    setText("trendPeriodLabel", !months.length ? TREND_EMPTY_TEXT : start === end ? `${MONTHS[end - 1]} ${year}` : `${MONTHS[start - 1]} sd ${MONTHS[end - 1]} ${year}`);
    const notice = document.getElementById("trendDataNotice");
    if (notice) {
        notice.innerText = !trendHasData ? TREND_EMPTY_TEXT : selectedMonth > latestAvailableMonth ? `Data tersedia sampai ${MONTHS[latestAvailableMonth - 1]} ${year}.` : "";
        notice.classList.toggle("hidden", !notice.innerText);
        ["text-center", "text-sm", "text-slate-500", "py-6"].forEach(cls => notice.classList.toggle(cls, !trendHasData));
    }

    const colors = {tagihan:"#4f46e5", pembayaran:"#059669", sisa:"#f43f5e"};
    const point = color => ({pointBackgroundColor:color, pointBorderColor:"#fff", pointBorderWidth:1.5, pointRadius:4, pointHoverRadius:7, borderWidth:2.5, tension:.22});
    const bar = (label, key, color, background) => ({type:"bar", label, data:totals.map(x=>x[key]), backgroundColor:background, borderColor:color, borderWidth:1, borderRadius:4, barPercentage:.58, categoryPercentage:.68});
    const line = (label, key, color, background, fill) => ({type:"line", label, data:totals.map(x=>x[key]), borderColor:color, backgroundColor:background, fill, ...point(color)});
    const datasets = trendMode === "sisa"
        ? [bar("Tagihan", "tagihan", colors.tagihan, "rgba(79,70,229,.78)"), bar("Sisa Tagihan", "sisa", colors.sisa, "rgba(225,29,72,.78)"), line("Pembayaran", "bayar", colors.pembayaran, "rgba(16,185,129,.08)", false)]
        : trendMode === "tagihan"
            ? [line("Tagihan", "tagihan", colors.tagihan, "rgba(79,70,229,.10)", true)]
            : [line("Pembayaran", "bayar", colors.pembayaran, "rgba(16,185,129,.10)", true)];

    const legend = document.getElementById("trendCustomLegend");
    if (legend) {
        legend.innerHTML = datasets.map(ds => `<span class="inline-flex items-center gap-2"><span style="display:inline-block;width:${ds.type === "line" ? 18 : 9}px;height:${ds.type === "line" ? 3 : 9}px;border-radius:2px;background:${ds.borderColor}"></span>${ds.label}</span>`).join("");
    }

    let hoveredTrendDatasetIndex = null;
    chartTrendInstance = new Chart(canvas.getContext("2d"), {
        type: trendMode === "sisa" ? "bar" : "line",
        data: {labels: months.map(m => m.slice(0, 3)), datasets},
        plugins: [{
            id: "pantauPointGuideLines",
            // Garis bantu putus-putus dari setiap titik garis ke sumbu X.
            afterDatasetsDraw(chart) {
                const {ctx, chartArea} = chart;
                if (!chartArea) return;
                ctx.save();
                ctx.strokeStyle = "rgba(148, 163, 184, 0.42)";
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 4]);
                chart.data.datasets.forEach((dataset, index) => {
                    if (chart.getDatasetMeta(index).type !== "line") return;
                    chart.getDatasetMeta(index).data.forEach(point => {
                        if (!point || point.skip) return;
                        const pos = point.getProps(["x", "y"], true);
                        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
                        ctx.beginPath();
                        ctx.moveTo(pos.x, pos.y);
                        ctx.lineTo(pos.x, chartArea.bottom);
                        ctx.stroke();
                    });
                });
                ctx.restore();
            }
        }],
        options: {responsive:true, maintainAspectRatio:false, animation: matchMedia("(prefers-reduced-motion: reduce)").matches ? false : {}, interaction:{mode:"nearest",intersect:true}, onHover:(event,activeElements)=>{hoveredTrendDatasetIndex=activeElements.length ? activeElements[0].datasetIndex : null;}, plugins:{
            legend:{display:false},
            tooltip:{enabled:false,mode:"index",intersect:true,position:"nearest",filter:item=>trendMode==="sisa" ? (hoveredTrendDatasetIndex===2 || item.datasetIndex===hoveredTrendDatasetIndex) : true,external:context=>{
                const {chart,tooltip}=context;
                let tip=document.getElementById("pantauTrendTooltip");
                if(!tip){tip=document.createElement("div");tip.id="pantauTrendTooltip";tip.style.cssText="position:absolute;pointer-events:none;opacity:0;z-index:30;min-width:190px;max-width:280px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:13px 15px;box-shadow:0 14px 32px rgba(15,23,42,.24),0 4px 10px rgba(15,23,42,.12);transition:opacity .08s ease;";chart.canvas.parentNode.appendChild(tip);}
                if(!tooltip||tooltip.opacity===0){tip.style.opacity="0";return;}
                const pts=tooltip.dataPoints||[];if(!pts.length){tip.style.opacity="0";return;}
                // Indeks titik dihitung dari bulan awal filter, bukan dari Januari.
                const month=MONTHS[start-1+pts[0].dataIndex]+" "+year;
                const fmt=v=>v==null?"Belum ada data":formatRupiah(v);
                const rows=pts.map(pt=>{const ds=pt.dataset;const color=ds.borderColor||ds.backgroundColor||"#111827";return `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:18px;font-size:13px;line-height:1.5;"><span style="color:#111827;font-weight:650;">${ds.label}</span><span style="color:${color};font-weight:800;white-space:nowrap;">${fmt(pt.raw)}</span></div>`;}).join("");
                tip.innerHTML=`<div style="font-size:15px;font-weight:700;letter-spacing:.01em;color:#64748b;">${month}</div><div style="height:1px;background:#e5e7eb;margin:9px 0 10px;"></div><div style="display:flex;flex-direction:column;gap:7px;">${rows}</div>`;
                const wrap=chart.canvas.parentNode;const left=Math.max(8,Math.min(tooltip.caretX+12,wrap.clientWidth-tip.offsetWidth-8));const top=Math.max(8,Math.min(tooltip.caretY+12,wrap.clientHeight-tip.offsetHeight-8));
                tip.style.left=left+"px";tip.style.top=top+"px";tip.style.opacity="1";
            }}
        }, scales:{x:{grid:{display:false},ticks:{color:"#64748b",font:{weight:"600"}}},y:{beginAtZero:true,grid:{color:"#e8eef7",borderDash:[4,4]},ticks:{color:"#64748b",callback:v=>`${Number((v / 1000000).toFixed(1)).toLocaleString("id-ID", {maximumFractionDigits: 1})}jt`}}}}
    });

    // Overlay empty state di dalam area grafik, ditentukan dari total bulanan (null bisa terbaca 0 oleh Chart.js).
    const chartWrap = canvas.parentElement;
    let emptyOverlay = chartWrap.querySelector(":scope > .pantau-chart-empty-overlay");
    if (trendHasData) {
        emptyOverlay?.remove();
    } else {
        if (!emptyOverlay) {
            emptyOverlay = document.createElement("div");
            emptyOverlay.className = "pantau-chart-empty-overlay";
            chartWrap.appendChild(emptyOverlay);
        }
        emptyOverlay.textContent = TREND_EMPTY_TEXT;
        emptyOverlay.style.setProperty("display", "flex", "important");
    }
}

// Tombol mode nonaktif sampai grafik pertama dirender dengan data.
syncTrendModeDisabledState(false);
