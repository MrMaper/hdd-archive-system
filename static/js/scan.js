// Scan — list real Windows drives, pick one or more, scan into catalog

var scanning = false;
var scanAbort = false;
var onlineDrives = []; // from /api/drives-online

// ─── PAGE SWITCH ──────────────────────────────────────────
function showScanPage() {
  document.getElementById("scanPanel").classList.add("active");
  loadOnlineDrives();
}
function hideScanPage() {
  document.getElementById("scanPanel").classList.remove("active");
}

// ─── LOAD ONLINE DRIVES ───────────────────────────────────
async function loadOnlineDrives() {
  var container = document.getElementById("availabilityInfo");
  container.innerHTML = '<p style="color:var(--text2);"><i class="fas fa-spinner fa-pulse"></i> در حال تشخیص درایوهای متصل...</p>';

  try {
    var data = await apiGet("/drives-online");
    onlineDrives = Array.isArray(data) ? data : [];

    if (onlineDrives.length === 0) {
      container.innerHTML = '<p style="color:var(--red);"><i class="fas fa-times-circle"></i> هیچ درایوی پیدا نشد!</p>';
      return;
    }

    // Build map of already-indexed paths
    var cat = await apiGet("/drives");
    var indexed = {};
    (cat.drives || []).forEach(function (d) {
      indexed[(d.path || "").toLowerCase()] = d;
    });

    // Separate new drives from already-scanned ones
    var newDrives = [];
    var oldDrives = [];

    onlineDrives.forEach(function (d) {
      var letterLower = d.letter.toLowerCase();
      var already = indexed[letterLower] || indexed[letterLower + ":\\"] || indexed[letterLower + ":"] || indexed[(letterLower + ":\\").replace(/\\/g,"")];
      if (!already) {
        var keys = Object.keys(indexed);
        for (var ki = 0; ki < keys.length; ki++) {
          var k = keys[ki].replace(/[\/\\:]/g, "");
          if (k === letterLower.replace(/:/g, "")) { already = indexed[keys[ki]]; break; }
        }
      }
      if (already) {
        oldDrives.push({ drive: d, catalogEntry: already });
      } else {
        newDrives.push(d);
      }
    });

    var html = '';

    // Explanation box
    html += '<div class="scan-help-box">';
    html += '<strong><i class="fas fa-thumbtack"></i> راهنما:</strong> ';
    if (newDrives.length > 0) {
      html += 'درایوهای جدید (هنوز اسکن نشده) در زیر نمایش داده می‌شوند. روی درایو(های) مورد نظر کلیک کن و اسکن را بزن. درایوهایی که قبلاً اسکن شده‌اند در بخش پایینی با نشان <span class="badge-text">✓ اسکن شده</span> مشخص شده‌اند.';
    } else {
      html += 'همه درایوهای متصل قبلاً اسکن شده‌اند. اگر هارد جدیدی وصل کردی، دکمه "تشخیص مجدد درایوها" را بزن.';
    }
    html += '</div>';

    // ── New drives section (prominent) ──
    if (newDrives.length > 0) {
      html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:nowrap;gap:12px;margin-bottom:12px;">'
           +  '<p style="color:var(--green);font-size:13px;font-weight:600;margin:0;white-space:nowrap;">'
           +    '<i class="fas fa-plus-circle"></i> ' + newDrives.length + ' درایو جدید (آماده اسکن) — برای انتخاب کلیک کن:'
           +  '</p>'
           +  '<button class="btn" onclick="loadOnlineDrives()" style="font-size:0.82rem;white-space:nowrap;flex-shrink:0;"><i class="fas fa-sync-alt"></i> تشخیص مجدد درایوها</button>'
           + '</div>';

      html += '<div class="drive-availability" id="chipContainer">';

      newDrives.forEach(function (d) {
        html +=
          '<div class="drive-chip" data-letter="' + esc(d.letter) + '" onclick="toggleChip(this)">'
          + '<span class="chip-letter">' + esc(d.letter) + '</span>'
          + '<span class="chip-info">'
          +   (d.label ? '<span class="chip-label">' + esc(d.label) + '</span>' : '<span style="color:var(--text2);font-size:0.85rem;">(بدون نام)</span>')
          +   '<span class="chip-space"><span dir="ltr" style="display:inline-block;direction:ltr;"><i class="fas fa-hdd"></i> ' + d.used_gb + ' / ' + d.total_gb + ' GB</span></span>'
          + '</span>'
          + '</div>';
      });

      html += '</div>';
    }

    // ── Already-scanned drives section (compact inline chips) ──
    if (oldDrives.length > 0) {
      html += '<div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border);">';
      html += '<p style="color:var(--text2);margin:0 0 6px;font-size:12px;font-weight:600;">'
           +  '<i class="fas fa-check-circle" style="color:var(--green);"></i> درایوهای قبلاً اسکن شده (' + oldDrives.length + '):</p>';
      html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';

      oldDrives.forEach(function (item) {
        var d = item.drive;
        var catalogEntry = item.catalogEntry;
        var driveTitle = catalogEntry.title || "بدون عنوان";
        var capText = d.total_gb + " GB";
        html +=
          '<span style="display:inline-flex;align-items:center;gap:4px;background:var(--surface2);border:1px dashed var(--border);border-radius:8px;padding:4px 10px;font-size:0.75rem;color:var(--text2);cursor:default;"'
          + ' title="اسکن شده: ' + esc(driveTitle) + '">'
          + '<i class="fas fa-check-circle" style="color:var(--green);font-size:0.7rem;"></i> '
          + '<span dir="ltr" style="display:inline-block;direction:ltr;">' + esc(d.letter) + ' <span style="opacity:0.6;">' + capText + '</span></span>'
          + '</span>';
      });

      html += '</div></div>';
    }

    if (newDrives.length === 0) {
      html += '<p style="color:var(--text2);margin:8px 0 0;font-size:13px;"><i class="fas fa-info-circle" style="color:var(--accent);"></i> همه درایوهای متصل قبلاً اسکن شده‌اند. اگر هارد جدیدی وصل کردی دکمه زیر را بزن.</p>';
    }

    html += '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">';
    html += '  <button class="btn btn-outline" onclick="rebuildDriveIndexes()" style="font-size:0.82rem;"><i class="fas fa-sync"></i> بازسازی ایندکس‌ها</button>';
    html += '</div>';

    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<p style="color:var(--red);"><i class="fas fa-exclamation-triangle"></i> خطا: ' + esc(String(e)) + '</p>';
  }
}

// ─── CHIP TOGGLE ──────────────────────────────────────────
function toggleChip(chip) {
  chip.classList.toggle("selected");
  updateLabelFieldState();
}

// ─── MANAGE LABEL INPUT & SCAN BUTTONS STATE ────────────
function updateLabelFieldState() {
  var selected = document.querySelectorAll(".drive-chip.selected");
  var input = document.getElementById("scanLabelInput");
  var deepBtn = document.getElementById("scanStartBtn");
  var quickBtn = document.getElementById("scanQuickBtn");

  // Enable/disable scan buttons based on selection
  var hasSelection = selected.length > 0;
  if (deepBtn) deepBtn.disabled = !hasSelection;
  if (quickBtn) quickBtn.disabled = !hasSelection;

  // Manage label input for batch vs single
  if (!input) return;
  if (selected.length > 1) {
    input.disabled = true;
    input.value = "";
    input.placeholder = "(در اسکن همزمان، نام‌گذاری را بعداً از تب هاردها انجام دهید)";
  } else {
    input.disabled = false;
    input.placeholder = "نام/برچسب دلخواه برای این اسکن (اختیاری)";
  }
}

// ─── START SCAN ───────────────────────────────────────────
async function startScan(mode) {
  try {
    if (scanning) return;
    scanAbort = false;

    var selected = document.querySelectorAll(".drive-chip.selected");
    if (selected.length === 0) {
      toast("<i class='fas fa-hand-paper'></i> هیچ درایوی انتخاب نشده! ابتدا روی درایوهای بالا کلیک کن", "error");
      return;
    }

    // Build target list
    var targets = [];
    var labelInput = document.getElementById("scanLabelInput");
    var customLabel = labelInput ? labelInput.value.trim() : "";
    selected.forEach(function (c) {
      var letter = c.getAttribute("data-letter");
      if (letter) targets.push({ letter: letter, path: letter });
    });
    if (targets.length === 0) {
      toast("خطا در تشخیص درایوهای انتخاب شده", "error");
      return;
    }

    // UI state
    scanning = true;
    var progressDiv = document.getElementById("scanProgress");
    var startBtn   = document.getElementById("scanStartBtn");
    var quickBtn   = document.getElementById("scanQuickBtn");
    var cancelBtn  = document.getElementById("scanCancelBtn");
    var statusEl   = document.getElementById("scanStatus");
    var barFill    = document.getElementById("scanBarFill");
    var pctEl      = document.getElementById("scanPct");

    if (!progressDiv || !startBtn || !cancelBtn || !statusEl) {
      toast("خطا: المان‌های صفحه پیدا نشدند! صفحه را refresh کن.", "error");
      return;
    }

    progressDiv.classList.add("active");
    startBtn.disabled = true;
    if (quickBtn) quickBtn.disabled = true;
    cancelBtn.style.display = "inline-block";

    var total = targets.length;
    var done  = 0;

    for (var i = 0; i < total; i++) {
      if (scanAbort) break;
      var drive = targets[i];
      var pctDone = Math.round((i / total) * 100);
      statusEl.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> اسکن ' + esc(drive.letter) + ' (' + (i + 1) + ' از ' + total + ') ... لطفاً صبر کن';
      updateScanBar(pctDone);

      var driveTitle = customLabel || drive.letter;
      var onlineInfo = onlineDrives.find(function(x){return x.letter===drive.letter;}) || {};
      if (!customLabel && onlineInfo.label) driveTitle += " (" + onlineInfo.label + ")";
      else if (customLabel && onlineInfo.label) driveTitle += " (" + drive.letter + ")";

      var result = null;
      try {
        var r = await fetch(API + "/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            drivePath: drive.path,
            title: driveTitle,
            physicalMark: "",
            quick: mode === "quick",
          }),
        });
        var ct = r.headers.get("content-type") || "";
        if (!r.ok) {
          var errText = "";
          try { errText = await r.text(); } catch(_){}
          throw new Error("HTTP " + r.status + (errText ? " - " + errText.substring(0,200) : ""));
        }
        if (ct.indexOf("application/json") === -1) {
          var raw = await r.text();
          throw new Error("پاسخ JSON نیست (content-type: " + ct + ")");
        }
        result = await r.json();
      } catch (e) {
        statusEl.innerHTML = '<i class="fas fa-times-circle"></i> خطا: ' + esc(e.message);
        toast("<i class='fas fa-times-circle'></i> خطا در اسکن " + drive.letter + ": " + e.message, "error");
        done++;
        continue;
      }

      if (result && result.success) {
        done++;
      } else {
        var msg = (result && result.error) ? result.error : "پاسخ نامعتبر از سرور";
        statusEl.innerHTML = '<i class="fas fa-times-circle"></i> ' + drive.letter + ": " + msg;
        toast("<i class='fas fa-times-circle'></i> " + drive.letter + ": " + msg, "error");
      }
    }

    // Done — fill bar to 100%
    updateScanBar(100);
    scanning = false;
    startBtn.disabled = false;
    if (quickBtn) quickBtn.disabled = false;
    cancelBtn.style.display = "none";

    if (!scanAbort) {
      statusEl.innerHTML = '<i class="fas fa-check-circle"></i> ' + done + " درایو با موفقیت اسکن و ثبت شد!";
    } else {
      statusEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> اسکن متوقف شد. " + done + " درایو ثبت شد.';
    }
    toast(done + " درایو اسکن و ثبت شد <i class='fas fa-check-circle'></i>", "success");

    // Unselect all chips
    document.querySelectorAll(".drive-chip.selected").forEach(function (c) { c.classList.remove("selected"); });

    // Hide progress after a moment, then redirect to drives tab with smooth fade
    setTimeout(function () {
      progressDiv.classList.remove("active");
      setTimeout(function () {
        switchTab("drives");
      }, 300);
    }, 3700);

    // Refresh other panels
    if (typeof loadDrives === "function") loadDrives();
    if (typeof loadStats === "function") loadStats();
    setTimeout(function() { if (typeof loadOnlineDrives === "function") loadOnlineDrives(); }, 600);
  } catch (err) {
    toast("خطای غیرمنتظره: " + err.message, "error");
  }
}

// ─── PROGRESS BAR HELPERS ─────────────────────────────────
function updateScanBar(pct) {
  var barFill = document.getElementById("scanBarFill");
  var pctEl   = document.getElementById("scanPct");
  if (barFill) barFill.style.width = pct + "%";
  if (pctEl) pctEl.textContent = pct + "%";
}

// ─── CANCEL ───────────────────────────────────────────────
function cancelScan() {
  scanAbort = true;
  scanning = false;
  var startBtn = document.getElementById("scanStartBtn");
  var quickBtn = document.getElementById("scanQuickBtn");
  var cancelBtn = document.getElementById("scanCancelBtn");
  var statusEl = document.getElementById("scanStatus");
  if (startBtn) startBtn.disabled = false;
  if (quickBtn) quickBtn.disabled = false;
  if (cancelBtn) cancelBtn.style.display = "none";
  if (statusEl) statusEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> اسکن کنسل شد';
}

// ─── REBUILD DRIVE INDEXES (rebuild folder indexes for all scanned drives) ──
async function rebuildDriveIndexes() {
  var container = document.getElementById("availabilityInfo");
  container.innerHTML = '<p style="color:var(--text2);"><i class="fas fa-spinner fa-pulse"></i> در حال بازسازی ایندکس‌های درایوهای اسکن شده ... لطفاً صبر کن</p>';

  try {
    var result = await apiPost("/rebuild-index", {});
    if (result && result.success) {
      toast("ایندکس " + result.rebuilt + " درایو با موفقیت بازسازی شد <i class='fas fa-check-circle'></i>", "success");
    } else {
      toast((result && result.error) || "خطا در بازسازی ایندکس", "error");
    }
  } catch (e) {
    toast("خطا: " + e.message, "error");
  }

  // Refresh the drives list
  loadOnlineDrives();
  if (typeof loadDrives === "function") loadDrives();
}
