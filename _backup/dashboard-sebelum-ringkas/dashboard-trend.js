// Dashboard: grafik tren sisa tagihan, tagihan, dan pembayaran.
function setTrendMode(mode) {
    // Guard the action itself as well as the disabled button appearance.
    // A click must never switch the chart mode when the current filters return no rows.
    const filters = selectedFilters("dashboard");
    const selectedMonth = Math.min(12, Math.max(1, Number(filters.month) || 9));
    const selectedStartMonth = Math.min(selectedMonth, Math.max(1, Number(filters.startMonth) || selectedMonth));
    const latestAvailableMonth = Number(filters.year) === 2026 ? 9 : 0;
    const chartEndMonth = Math.min(selectedMonth, latestAvailableMonth);
    const months = chartEndMonth >= selectedStartMonth ? DEMO_MONTHS.slice(selectedStartMonth - 1, chartEndMonth) : [];
    const hasData = months.some((_, idx) => getDemoRows(selectedStartMonth + idx, Number(filters.year), filters.search).length > 0);
    if (!hasData) {
        syncTrendModeDisabledState(false);
        return;
    }
    trendMode = ["sisa", "tagihan", "pembayaran"].includes(mode) ? mode : "sisa";
    document.querySelectorAll("[data-trend-mode]").forEach(button => {
        const active = button.dataset.trendMode === trendMode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    renderTrendChart();
}

function syncTrendModeDisabledState(forceNoData) {
    const filters = selectedFilters("dashboard");
    const selectedMonth = Math.min(12, Math.max(1, Number(filters.month) || 9));
    const selectedStartMonth = Math.min(selectedMonth, Math.max(1, Number(filters.startMonth) || selectedMonth));
    const latestAvailableMonth = Number(filters.year) === 2026 ? 9 : 0;
    const chartEndMonth = Math.min(selectedMonth, latestAvailableMonth);
    const months = chartEndMonth >= selectedStartMonth ? DEMO_MONTHS.slice(selectedStartMonth - 1, chartEndMonth) : [];
    const hasData = !forceNoData && months.some((_, idx) => getDemoRows(selectedStartMonth + idx, Number(filters.year), filters.search).length > 0);
    document.querySelectorAll("[data-trend-mode]").forEach(button => {
        button.disabled = !hasData;
        button.setAttribute("aria-disabled", hasData ? "false" : "true");
        button.title = hasData ? "" : "Tidak ada data yang cocok.";
    });
    return hasData;
}
window.syncTrendModeDisabledState = syncTrendModeDisabledState;

function renderTrendChart() {
    const canvas = document.getElementById("chartTrend");
    if (!canvas) return;
    if (chartTrendInstance) chartTrendInstance.destroy();
    const filters = selectedFilters("dashboard");
    const selectedMonth = Math.min(12, Math.max(1, Number(filters.month) || 9));
    const selectedStartMonth = Math.min(selectedMonth, Math.max(1, Number(filters.startMonth) || selectedMonth));
    // Database PANTAU memiliki data sampai bulan terakhir yang tersedia. Grafik hanya menampilkan bulan dalam rentang terpilih yang tersedia.
    const latestAvailableMonth = Number(filters.year) === 2026 ? 9 : 0;
    const chartEndMonth = Math.min(selectedMonth, latestAvailableMonth);
    const visibleMonths = chartEndMonth >= selectedStartMonth ? DEMO_MONTHS.slice(selectedStartMonth - 1, chartEndMonth) : [];
    const labels = visibleMonths.map(m => m.slice(0, 3));
    const totals = visibleMonths.map((_, idx) => {
        const m = selectedStartMonth + idx;
        const rows = getDemoRows(m, Number(filters.year), filters.search);
        const tagihan = rows.reduce((sum, r) => sum + Number(r.tagihan || 0), 0);
        const bayar = rows.reduce((sum, r) => sum + Number(r.bayar || 0), 0);
        return rows.length ? {tagihan, bayar, sisa: Math.max(0, tagihan - bayar)} : {tagihan: null, bayar: null, sisa: null};
    });
    syncTrendModeDisabledState(!totals.some(row => row && [row.tagihan, row.bayar, row.sisa].some(value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)))));
    const fmtRp = value => "Rp " + Number(value || 0).toLocaleString("id-ID");
    const fmtJuta = value => {
        if (value == null || !Number.isFinite(Number(value))) return "";
        const juta = Number(value) / 1000000;
        const rounded = Number(juta.toFixed(1));
        return `${rounded.toLocaleString("id-ID", {maximumFractionDigits: 1})}jt`;
    };
    const activeMonthName = chartEndMonth >= selectedStartMonth ? DEMO_MONTHS[chartEndMonth - 1] : "Belum tersedia";
    const trendLabel = document.getElementById("trendPeriodLabel");
    if (trendLabel) trendLabel.innerText = chartEndMonth >= selectedStartMonth ? (selectedStartMonth === chartEndMonth ? `${activeMonthName} ${filters.year}` : `${DEMO_MONTHS[selectedStartMonth - 1]} sd ${activeMonthName} ${filters.year}`) : `Tidak ada data yang cocok.`;
    const notice = document.getElementById("trendDataNotice");
    if (notice) {
        const hasTrendData = chartEndMonth >= selectedStartMonth;
        notice.innerText = hasTrendData ? (selectedMonth > latestAvailableMonth ? `Data tersedia sampai ${DEMO_MONTHS[latestAvailableMonth - 1]} ${filters.year}.` : "") : `Tidak ada data yang cocok.`;
        notice.classList.toggle("hidden", !notice.innerText);
        notice.classList.toggle("text-center", !hasTrendData);
        notice.classList.toggle("text-sm", !hasTrendData);
        notice.classList.toggle("text-slate-500", !hasTrendData);
        notice.classList.toggle("py-6", !hasTrendData);
    }

    const colors = {tagihan:"#4f46e5", pembayaran:"#059669", sisa:"#f43f5e"};
    let datasets = [];
    let chartType = "line";
    if (trendMode === "sisa") {
        chartType = "bar";
        datasets = [
            {type:"bar", label:"Tagihan", data:totals.map(x=>x.tagihan), backgroundColor:"rgba(79,70,229,.78)", borderColor:colors.tagihan, borderWidth:1, borderRadius:4, barPercentage:.58, categoryPercentage:.68, yAxisID:"y"},
            {type:"bar", label:"Sisa Tagihan", data:totals.map(x=>x.sisa), backgroundColor:"rgba(225,29,72,.78)", borderColor:colors.sisa, borderWidth:1, borderRadius:4, barPercentage:.58, categoryPercentage:.68, yAxisID:"y"},
            {type:"line", label:"Pembayaran", data:totals.map(x=>x.bayar), borderColor:colors.pembayaran, backgroundColor:"rgba(16,185,129,.08)", pointBackgroundColor:colors.pembayaran, pointBorderColor:"#fff", pointBorderWidth:1.5, pointRadius:4, pointHoverRadius:7, borderWidth:2.5, tension:.22, spanGaps:false, yAxisID:"y", fill:false}
        ];
    } else if (trendMode === "tagihan") {
        datasets = [{label:"Tagihan",data:totals.map(x=>x.tagihan),borderColor:colors.tagihan,backgroundColor:"rgba(79,70,229,.10)",pointBackgroundColor:colors.tagihan,pointBorderColor:"#fff",pointBorderWidth:1.5,pointRadius:4,pointHoverRadius:7,borderWidth:2.5,tension:.22,spanGaps:false,fill:true}];
    } else {
        datasets = [{label:"Pembayaran",data:totals.map(x=>x.bayar),borderColor:colors.pembayaran,backgroundColor:"rgba(16,185,129,.10)",pointBackgroundColor:colors.pembayaran,pointBorderColor:"#fff",pointBorderWidth:1.5,pointRadius:4,pointHoverRadius:7,borderWidth:2.5,tension:.22,spanGaps:false,fill:true}];
    }
    const legend = document.getElementById("trendCustomLegend");
    if (legend) {
        const entries = trendMode === "sisa" ? [{label:"Tagihan",color:colors.tagihan,kind:"bar"},{label:"Sisa Tagihan",color:colors.sisa,kind:"bar"},{label:"Pembayaran",color:colors.pembayaran,kind:"line"}] : trendMode === "tagihan" ? [{label:"Tagihan",color:colors.tagihan,kind:"line"}] : [{label:"Pembayaran",color:colors.pembayaran,kind:"line"}];
        legend.innerHTML = entries.map(e => `<span class="inline-flex items-center gap-2"><span style="display:inline-block;width:${e.kind === "line" ? 18 : 9}px;height:${e.kind === "line" ? 3 : 9}px;border-radius:${e.kind === "line" ? 2 : 2}px;background:${e.color}"></span>${e.label}</span>`).join("");
    }
    let hoveredTrendDatasetIndex = null;
    chartTrendInstance = new Chart(canvas.getContext("2d"), {
        type: chartType,
        data: {labels, datasets},
        plugins: [{
            id: "pantauPointGuideLines",
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
        options: {responsive:true, maintainAspectRatio:false, interaction:{mode:"nearest",intersect:true}, onHover:(event,activeElements)=>{hoveredTrendDatasetIndex=activeElements.length ? activeElements[0].datasetIndex : null;}, plugins:{
            legend:{display:false},
            tooltip:{enabled:false,mode:"index",intersect:true,position:"nearest",filter:item=>trendMode==="sisa" ? (hoveredTrendDatasetIndex===2 || item.datasetIndex===hoveredTrendDatasetIndex) : true,external:context=>{
                const {chart,tooltip}=context;
                let tip=document.getElementById("pantauTrendTooltip");
                if(!tip){tip=document.createElement("div");tip.id="pantauTrendTooltip";tip.style.cssText="position:absolute;pointer-events:none;opacity:0;z-index:30;min-width:190px;max-width:280px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:13px 15px;box-shadow:0 14px 32px rgba(15,23,42,.24),0 4px 10px rgba(15,23,42,.12);transition:opacity .08s ease;";chart.canvas.parentNode.appendChild(tip);}
                if(!tooltip||tooltip.opacity===0){tip.style.opacity="0";return;}
                const pts=tooltip.dataPoints||[];if(!pts.length){tip.style.opacity="0";return;}
                const idx=pts[0].dataIndex;const month=DEMO_MONTHS[idx]+" "+filters.year;
                const fmt=v=>v==null?"Belum ada data":fmtRp(v);
                const rows=pts.map(pt=>{const ds=pt.dataset;const color=ds.borderColor||ds.backgroundColor||"#111827";return `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:18px;font-size:13px;line-height:1.5;"><span style="color:#111827;font-weight:650;">${ds.label}</span><span style="color:${color};font-weight:800;white-space:nowrap;">${fmt(pt.raw)}</span></div>`;}).join("");
                tip.innerHTML=`<div style="font-size:15px;font-weight:700;letter-spacing:.01em;color:#64748b;">${month}</div><div style="height:1px;background:#e5e7eb;margin:9px 0 10px;"></div><div style="display:flex;flex-direction:column;gap:7px;">${rows||'<div style="color:#64748b;font-size:13px;">Belum ada data untuk bulan ini</div>'}</div>`;
                const wrap=chart.canvas.parentNode;const left=Math.max(8,Math.min(tooltip.caretX+12,wrap.clientWidth-tip.offsetWidth-8));const top=Math.max(8,Math.min(tooltip.caretY+12,wrap.clientHeight-tip.offsetHeight-8));
                tip.style.left=left+"px";tip.style.top=top+"px";tip.style.opacity="1";
            }}
        }, scales:{x:{grid:{display:false},ticks:{color:"#64748b",font:{weight:"600"}}},y:{beginAtZero:true,grid:{color:"#e8eef7",borderDash:[4,4]},ticks:{color:"#64748b",callback:v=>fmtJuta(v)}}}}
    });
    // Explicit empty-state overlay inside the chart area. Determine emptiness from
    // the filtered monthly totals, not from Chart.js parsed values (null may parse as 0).
    const chartWrap = canvas.parentElement;
    if (chartWrap) {
        let emptyOverlay = chartWrap.querySelector(':scope > .pantau-chart-empty-overlay');
        const hasMatchingData = totals.some(row => {
            const value = row && row[trendMode];
            return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
        });
        const hasVisiblePeriod = visibleMonths.length > 0;
        const showEmpty = !hasMatchingData || !hasVisiblePeriod;
        if (showEmpty) {
            if (!emptyOverlay) {
                emptyOverlay = document.createElement('div');
                emptyOverlay.className = 'pantau-chart-empty-overlay';
                chartWrap.appendChild(emptyOverlay);
            }
            chartWrap.style.position = 'relative';
            emptyOverlay.textContent = 'Tidak ada data yang cocok.';
            emptyOverlay.style.setProperty('display', 'flex', 'important');
            emptyOverlay.style.setProperty('visibility', 'visible', 'important');
        } else if (emptyOverlay) {
            emptyOverlay.remove();
        }
    }
}
