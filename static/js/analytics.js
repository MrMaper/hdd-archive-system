/**
 * Analytics Module — Space Analytics
 * Handles /api/analytics endpoint: top 100 files & space distribution chart.
 */

let analyticsChart = null;

/**
 * Format bytes to human-readable string (RTL-safe)
 */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  const val = (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1);
  return `<span dir="ltr" style="display: inline-block; direction: ltr;">${val} ${units[i]}</span>`;
}

/**
 * Return a short file name for display (max N chars)
 */
function truncateName(name, maxLen = 40) {
  if (!name) return '';
  if (name.length <= maxLen) return name;
  return name.substring(0, maxLen - 3) + '...';
}

/**
 * Format a file path for RTL display — wrap in LTR
 */
function ltrPath(path) {
  if (!path) return '';
  return `<span dir="ltr" style="display: inline-block; direction: ltr; max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(path)}</span>`;
}

/**
 * Escape HTML entities
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Populate the analytics drive filter dropdown from catalog
 */
function populateAnalyticsDriveFilter() {
  const sel = document.getElementById('analyticsDriveFilter');
  if (!sel) return;
  // Keep the "all" option
  sel.innerHTML = '<option value="all">همه درایوها</option>';
  apiGet('/drives')
    .then((data) => {
      const drives = data?.drives || [];
      drives.forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.title || d.id;
        sel.appendChild(opt);
      });
    })
    .catch(() => {});
}

/**
 * Main entry point: fetch analytics data and render everything
 */
function loadAnalytics() {
  const btn = document.getElementById('analyticsRefreshBtn');
  const container = document.getElementById('analyticsContent');
  if (!container) return;

  // Disable button during loading
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> در حال آنالیز...';
  }

  container.innerHTML = `<div class="progress active"><div class="spinner"></div><p>در حال آنالیز فضا...</p></div>`;

  // Read drive filter
  const driveFilter = document.getElementById('analyticsDriveFilter');
  const driveId = driveFilter ? driveFilter.value : 'all';

  const url = driveId && driveId !== 'all' ? '/analytics?drive_id=' + encodeURIComponent(driveId) : '/analytics';

  apiGet(url)
    .then((data) => {
      // Re-enable button
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sync"></i> شروع آنالیز';
      }
      if (!data || (!data.top_files && !data.space_distribution)) {
        container.innerHTML = `<div class="empty-state"><div class="icon"><i class="fas fa-exclamation-triangle fa-3x"></i></div><p>داده‌ای برای آنالیز یافت نشد. ابتدا یک هارد اسکن کنید.</p></div>`;
        return;
      }
      renderAnalytics(container, data);
    })
    .catch((err) => {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sync"></i> شروع آنالیز';
      }
      container.innerHTML = `<div class="empty-state"><div class="icon"><i class="fas fa-exclamation-triangle fa-3x"></i></div><p>خطا در دریافت اطلاعات: ${escapeHtml(err.message || err)}</p></div>`;
    });
}

/**
 * Render all analytics content: chart + top files table
 */
function renderAnalytics(container, data) {
  const topFiles = data.top_files || [];
  const spaceDist = data.space_distribution || [];
  const driveTotals = data.drive_totals || [];

  container.innerHTML = '';

  // ─── Chart Section ──────────────────────────────────────
  const chartSection = document.createElement('div');
  chartSection.className = 'analytics-chart-section';
  chartSection.innerHTML = `<h4 style="font-family: 'Kalameh','Vazirmatn',sans-serif;"><i class="fas fa-chart-pie"></i> توزیع فضا — پوشه‌های سطح اول هر درایو</h4><div id="analyticsChartContainer" style="width:100%;height:400px;"></div>`;
  container.appendChild(chartSection);

  // Build chart data: Treemap of drives and their top-level folders
  renderChart(spaceDist, driveTotals);

  // ─── Top Files Section ──────────────────────────────────
  const driveFilter = document.getElementById('analyticsDriveFilter');
  const driveId = driveFilter ? driveFilter.value : 'all';
  const driveText = driveId && driveId !== 'all' ? (driveFilter.options[driveFilter.selectedIndex]?.text || driveId) : 'تمام درایوها';
  const filesSection = document.createElement('div');
  filesSection.className = 'analytics-files-section';
  filesSection.innerHTML = `
    <h4><i class="fas fa-rocket"></i> غول‌های هارد — بزرگترین فایل‌ها (${topFiles.length})</h4>
    <div class="analytics-files-subtitle">
      <span>لیست ${topFiles.length} فایل بزرگ در ${driveText}</span>
      <span class="stat-ltr">${formatBytesInternal(topFiles.reduce((s, f) => s + (f.size_bytes || 0), 0))} مجموع</span>
    </div>
    <div id="analyticsFilesList"></div>
  `;
  container.appendChild(filesSection);

  // Render files list
  renderTopFiles(topFiles);
}

/**
 * Render the chart using ApexCharts (Treemap or Pie)
 */
function renderChart(spaceDist, driveTotals) {
  const chartContainer = document.getElementById('analyticsChartContainer');
  if (!chartContainer) return;

  // Build treemap series: group by drive_label
  if (spaceDist.length === 0 && driveTotals.length > 0) {
    // Fallback: Pie chart of drive totals only (no folder details)
    const labels = driveTotals.map((d) => d.drive_label || d.drive_id);
    const series = driveTotals.map((d) => parseFloat((d.used_gb || 0).toFixed(2)));

    const options = {
      chart: {
        type: 'pie',
        height: 400,
        foreColor: '#ccc',
        background: 'transparent',
        toolbar: { show: false },
      },
      series: series,
      labels: labels,
      theme: { mode: 'dark' },
      colors: ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6'],
      legend: {
        position: 'bottom',
        labels: { colors: '#ccc' },
      },
      tooltip: {
        y: {
          formatter: (val) => formatBytesInternal(val * 1024 * 1024 * 1024),
        },
      },
      title: {
        text: 'حجم مصرفی هر درایو',
        align: 'center',
        style: { color: '#ccc', fontSize: '14px', fontFamily: 'Kalameh, Vazirmatn, sans-serif' },
      },
      dataLabels: {
        enabled: true,
        formatter: (val, opts) => {
          return opts.w.config.series[opts.seriesIndex] + ' GB';
        },
        style: { fontSize: '12px', colors: ['#fff'] },
      },
      responsive: [
        {
          breakpoint: 600,
          options: {
            chart: { height: 300 },
            legend: { position: 'bottom', fontSize: '11px' },
          },
        },
      ],
    };

    if (analyticsChart) analyticsChart.destroy();
    analyticsChart = new ApexCharts(chartContainer, options);
    analyticsChart.render();
    return;
  }

  // Treemap: group folders by drive
  const seriesMap = {};
  spaceDist.forEach((item) => {
    const label = item.drive_label || item.drive_id;
    if (!seriesMap[label]) {
      seriesMap[label] = { name: label, data: [] };
    }
    seriesMap[label].data.push({
      x: item.folder_name || '?',
      y: parseFloat((item.size_gb || 0).toFixed(2)),
    });
  });

  // Convert to array sorted by total size descending
  const series = Object.values(seriesMap).map((s) => ({
    name: s.name,
    data: s.data.sort((a, b) => b.y - a.y).slice(0, 15), // top 15 folders per drive
  }));

  if (series.length === 0) {
    chartContainer.innerHTML = '<p style="color:var(--text2);text-align:center">داده‌ای برای رسم نمودار وجود ندارد</p>';
    return;
  }

  const options = {
    chart: {
      type: 'treemap',
      height: 400,
      foreColor: '#eee',
      background: 'transparent',
      toolbar: { show: false },
    },
    series: series,
    theme: { mode: 'dark' },
    colors: ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6'],
    legend: {
      position: 'bottom',
      labels: { colors: '#ccc' },
    },
    tooltip: {
      y: {
        formatter: (val) => formatBytesInternal(val * 1024 * 1024 * 1024),
      },
    },
    title: {
      text: 'توزیع فضا — پوشه‌های سطح اول هر درایو',
      align: 'center',
      style: { color: '#ccc', fontSize: '14px', fontFamily: 'Kalameh, Vazirmatn, sans-serif' },
    },
    plotOptions: {
      treemap: {
        enableShades: true,
        shadeIntensity: 0.5,
        reverseNegativeShade: true,
        colorScale: {
          ranges: [
            { from: 0, to: 10, color: '#2d3748', foreColor: '#eee' },
            { from: 10, to: 50, color: '#4a5568', foreColor: '#eee' },
            { from: 50, to: 200, color: '#6366f1', foreColor: '#fff' },
            { from: 200, to: 500, color: '#8b5cf6', foreColor: '#fff' },
            { from: 500, to: 1000, color: '#a855f7', foreColor: '#fff' },
            { from: 1000, to: Infinity, color: '#d946ef', foreColor: '#fff' },
          ],
        },
      },
    },
    dataLabels: {
      enabled: true,
      style: { fontSize: '12px', colors: ['#eee'] },
      offsetY: -4,
      formatter: function (text, op) {
        const val = op.value;
        return text + ' (' + val.toFixed(1) + ' GB)';
      },
    },
    responsive: [
      {
        breakpoint: 600,
        options: {
          chart: { height: 300 },
          legend: { position: 'bottom', fontSize: '11px' },
          dataLabels: { style: { fontSize: '10px' } },
        },
      },
    ],
  };

  if (analyticsChart) analyticsChart.destroy();
  analyticsChart = new ApexCharts(chartContainer, options);
  analyticsChart.render();
}

/**
 * Render the top files list
 */
function renderTopFiles(topFiles) {
  const listContainer = document.getElementById('analyticsFilesList');
  if (!listContainer) return;

  if (topFiles.length === 0) {
    listContainer.innerHTML = '<div class="empty-state"><p>فایلی یافت نشد</p></div>';
    return;
  }

  let html = '';
  topFiles.forEach((file, idx) => {
    const rank = idx + 1;
    const sizeStr = formatBytes(file.size_bytes);
    const pathHtml = ltrPath(file.file_path);
    const driveLabel = escapeHtml(file.drive_label || file.drive_id || '');

    html += `
      <div class="top-file-row">
        <div class="top-file-rank">${rank}</div>
        <div class="top-file-info">
          <div class="top-file-name" title="${escapeHtml(file.file_name || '')}">
            <span class="file-icon"><i class="fas fa-file"></i></span>
            ${truncateName(escapeHtml(file.file_name || ''), 60)}
          </div>
          <div class="top-file-path">${pathHtml}</div>
          <div class="top-file-meta">
            <span class="top-file-drive"><i class="fas fa-hdd"></i> ${driveLabel}</span>
          </div>
        </div>
        <div class="top-file-size">${sizeStr}</div>
        <div class="top-file-actions">
          <button class="btn-icon" title="باز کردن مسیر در Explorer" onclick="openFileLocation('${escapeHtml(file.drive_id || '')}','${encodeURIComponent(file.file_path || '')}')">
            <i class="fas fa-folder-open"></i>
          </button>
        </div>
      </div>
    `;
  });

  listContainer.innerHTML = html;

  // Also inject some CSS for the rank badge colors
  injectRankStyles();
}

/**
 * Inject rank badge dynamic styles
 */
function injectRankStyles() {
  if (document.getElementById('topFileRankStyles')) return;
  const style = document.createElement('style');
  style.id = 'topFileRankStyles';
  style.textContent = `
    .top-file-rank:nth-of-type(1),
    .top-file-row:nth-child(1) .top-file-rank {
      background: linear-gradient(135deg, #ffd700, #ffaa00);
      color: #1a1a2e;
      box-shadow: 0 0 12px rgba(255, 215, 0, 0.5);
    }
  `;
  document.head.appendChild(style);
}

/**
 * Open folder for a top file in Explorer (POST /api/open-folder)
 * Exact copy of openFileLocation from duplicates.js
 */
async function openFileLocation(driveId, filePathEncoded) {
  const filePath = decodeURIComponent(filePathEncoded);
  try {
    const resp = await fetch("/api/open-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drive_id: driveId, file_path: filePath }),
    });
    const data = await resp.json();
    if (data.error) {
      showToast("❌ " + data.error, "error");
    } else {
      showToast("✅ پوشه در Explorer باز شد", "success");
    }
  } catch (e) {
    showToast("❌ خطا: " + e.message, "error");
  }
}

/**
 * Internal: format bytes to string without HTML wrapping
 */
function formatBytesInternal(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  const val = (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1);
  return `${val} ${units[i]}`;
}

/**
 * Show a toast/notification (utility)
 */
function showToast(msg, type) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast" + (type === "error" ? " error" : type === "success" ? " success" : "");
  toast.textContent = msg;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}