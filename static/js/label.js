// Label generation — clean, minimal, print-friendly

var _html2canvasLoaded = false;
function ensureHtml2canvas(cb) {
  if (typeof html2canvas !== 'undefined') { cb(); return; }
  if (_html2canvasLoaded) {
    setTimeout(function(){ ensureHtml2canvas(cb); }, 200);
    return;
  }
  _html2canvasLoaded = true;
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
  s.onload = cb;
  s.onerror = function() { toast('خطا در بارگذاری html2canvas', 'error'); };
  document.head.appendChild(s);
}

// Extract drive letter from path (e.g. "K:\" -> "K")
function getDriveLetter(d) {
  var p = d.path || d.drive_path || "";
  var m = p.match(/^([A-Za-z]):/);
  return m ? m[1] : "";
}

async function showLabel(id) {
  try { var d = await apiGet("/drive/" + encodeURIComponent(id)); }
  catch (e) { toast("خطا در دریافت اطلاعات", "error"); return; }
  if (d.error) { toast(d.error, "error"); return; }

  var modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.onclick = function (e) { if (e.target === modal) modal.remove(); };

  var jalaliDate = toJalaliNumeric(d.date_added);
  var pct = d.capacity_gb > 0 ? Math.min(100, Math.round((d.used_space_gb / d.capacity_gb) * 100)) : 0;
  var sorted = (d.contents || []).slice().sort(function (a, b) { return b.size_gb - a.size_gb; });
  var driveLetter = getDriveLetter(d);
  var volumeName = d.volume_name || "";
  var volDisplay = volumeName ? driveLetter + ": " + volumeName : driveLetter + ":";

  // ── HTML ──
  var html = '<div class="label-modal">';

  // Header
  html += '<div class="label-modal-header">';
  html += '  <h2><i class="fas fa-tag"></i> لیبل هارد</h2>';
  html += '  <button class="label-modal-close" onclick="this.closest(\'.modal-overlay\').remove()"><i class="fas fa-times"></i></button>';
  html += '</div>';

  // ── Label card 1 (full, with folder details) ──
  html += buildLabelCardFull(d, jalaliDate, pct, sorted, volDisplay);

  // ── Label card 2 (simplified, without folder details) ──
  html += '<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px;">';
  html += '  <p style="margin:0 0 4px;font-size:0.75rem;color:var(--text2);"><i class="fas fa-tag"></i> مدل ساده (بدون جزئیات پوشه‌ها)</p>';
  html += buildLabelCardSimple(d, jalaliDate, pct, volDisplay);
  html += '</div>';

  // ── Actions ──
  html += '<div class="label-actions" style="margin-top:12px;">';
  html += '  <div class="label-actions-group">';
  // Download dropdown
  html += '    <div class="label-dd">';
  html += '      <button class="btn primary label-dd-btn"><i class="fas fa-download"></i> دانلود <i class="fas fa-chevron-down" style="font-size:0.6rem;"></i></button>';
  html += '      <div class="label-dd-menu">';
  html += '        <div class="label-dd-item" onclick="exportLabelImage(\'' + esc(d.id) + '\', false)"><i class="fas fa-file-image"></i> لیبل کامل</div>';
  html += '        <div class="label-dd-item" onclick="exportLabelImage(\'' + esc(d.id) + '\', true)"><i class="fas fa-file-image"></i> لیبل ساده</div>';
  html += '        <div class="label-dd-divider"></div>';
  html += '        <div class="label-dd-item" onclick="exportLabelRotated(\'' + esc(d.id) + '\', false)"><i class="fas fa-undo"></i> کامل (چرخیده)</div>';
  html += '        <div class="label-dd-item" onclick="exportLabelRotated(\'' + esc(d.id) + '\', true)"><i class="fas fa-undo"></i> ساده (چرخیده)</div>';
  html += '      </div>';
  html += '    </div>';
  html += '    <button class="btn" onclick="copyLabelCSV(\'' + esc(d.id) + '\')"><i class="fas fa-file-csv"></i> CSV</button>';
  html += '  </div>';
  html += '</div>';

  html += '</div>'; // .label-modal

  modal.innerHTML = html;
  document.body.appendChild(modal);
}

// ── Build full label card (with folder contents) ──
function buildLabelCardFull(d, jalaliDate, pct, sorted, volDisplay) {
  var html = '<div class="label-card-full" id="labelPreview">';

  // ── Title (big, center, bold) ──
  html += '<div class="l-title">';
  html += '  <h1 class="l-title-h">' + esc(d.title || "بدون عنوان") + '</h1>';
  // Physical mark — direction handled by CSS (ltr + unicode-bidi:embed)
  if (d.physical_mark) {
    html += '  <span class="l-phys">' + esc(d.physical_mark) + '</span>';
  }
  html += '</div>';

  // ── Separator ──
  html += '<div class="l-sep"></div>';

  // ── ID + Date ──
  html += '<div class="l-id-bar">';
  html += '  <span class="l-id">' + esc(d.id) + '</span>';
  html += '  <span class="l-date"><i class="far fa-calendar-alt"></i> ' + esc(jalaliDate) + '</span>';
  html += '</div>';

  // ── Stats ──
  var usedStr = formatGbCompact(d.used_space_gb);
  var totalStr = formatGbCompact(d.capacity_gb);
  html += '<div class="l-summary">';
  html += '  <span class="l-sum-item"><i class="fas fa-hdd"></i> ' + usedStr + ' از ' + totalStr + '</span>';
  html += '  <span class="l-sum-dot">•</span>';
  html += '  <span class="l-sum-item"><i class="fas fa-file"></i> ' + formatCount(d.total_files || 0) + '</span>';
  html += '  <span class="l-sum-dot">•</span>';
  html += '  <span class="l-sum-item"><i class="fas fa-folder"></i> ' + (d.folder_count || (d.contents || []).length) + '</span>';
  html += '  <span class="l-sum-dot">•</span>';
  html += '  <span class="l-sum-item l-sum-pct">' + pct + '%</span>';
  html += '</div>';

  // ── Progress bar ──
  html += '<div class="l-progress-wrap"><div class="l-progress-bg"><div class="l-progress-fill" style="width:' + pct + '%;"></div></div></div>';

  // ── Contents heading ──
  if (sorted.length > 0) {
    html += '<div class="l-contents">';
    html += '  <div class="l-ctitle"><i class="fas fa-list"></i> محتوا</div>';
    var showCount = Math.min(sorted.length, 5);
    for (var i = 0; i < showCount; i++) {
      var f = sorted[i];
      html += '<div class="l-item">';
      html += '  <span class="l-item-idx">' + '.' + pad2(i + 1) + '\u200E</span>';
      html += '  <span class="l-item-name">' + esc(f.name || "") + '</span>';
      html += '  <span class="l-item-size">' + formatGb(f.size_gb) + ' • ' + formatCount(f.file_count || 0) + '</span>';
      html += '</div>';
    }
    if (sorted.length > 5) {
      html += '  <div class="l-item l-item-more"><span dir="ltr">+ ' + (sorted.length - 5) + '</span> پوشه دیگر</div>';
    }
    html += '</div>';
  }

  // ── Footer ──
  html += '<div class="l-footer">';
  html += '  <span>MrMaper HDD Archive System</span>';
  html += '  <span>' + esc(volDisplay) + '</span>';
  html += '</div>';

  html += '</div>'; // .label-card-full

  return html;
}

// ── Build simple label card (no folder contents) — sticker-optimized ──
function buildLabelCardSimple(d, jalaliDate, pct, volDisplay) {
  var usedStr = formatGbCompact(d.used_space_gb);
  var totalStr = formatGbCompact(d.capacity_gb);
  var html = '<div class="label-card-simple" id="labelPreviewSimple">';

  // ── TOP ROW: Drive ID (left-aligned, LTR) + Date (right-aligned) ──
  html += '<div class="ls-top-row">';
  html += '  <span class="ls-id">' + esc(d.id) + '</span>';
  html += '  <span class="ls-date">' + esc(jalaliDate) + '</span>';
  html += '</div>';

  // ── MIDDLE: Title big ──
  // Match full label structure exactly: flex column center container
  html += '<div class="ls-title-block">';
  html += '  <h1 class="ls-title-h">' + esc(d.title || "بدون عنوان") + '</h1>';
  // Physical mark — same as l-phys in full label
  if (d.physical_mark) {
    html += '  <span class="ls-phys">' + esc(d.physical_mark) + '</span>';
  }
  html += '</div>';

  // ── Full-width progress bar ──
  html += '<div class="ls-bar-line">';
  html += '  <div class="ls-bar-track">';
  html += '    <div class="ls-bar-fill" style="width:' + pct + '%;"></div>';
  html += '    <span class="ls-bar-pct">' + pct + '%</span>';
  html += '  </div>';
  html += '</div>';

  // ── Stats row (compact) ──
  html += '<div class="ls-stats">';
  html += '  <span class="ls-stat-item"><i class="fas fa-hdd"></i> ' + usedStr + ' / ' + totalStr + '</span>';
  html += '  <span class="ls-stat-item"><i class="fas fa-file"></i> ' + formatCount(d.total_files || 0) + '</span>';
  if (volDisplay) {
    html += '  <span class="ls-stat-item ls-stat-vol">' + esc(volDisplay) + '</span>';
  }
  html += '</div>';

  html += '</div>'; // .label-card-simple

  return html;
}

// ── Helpers ──

function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}

function formatGb(gb) {
  if (gb == null) return "0 GB";
  var num = Number(gb);
  if (num >= 1000) return (num / 1000).toFixed(2) + " TB";
  return num.toFixed(2) + " GB";
}

function formatGbCompact(gb) {
  if (gb == null) return "0G";
  var num = Number(gb);
  if (num >= 1000) return (num / 1000).toFixed(2) + "T";
  return num.toFixed(0) + "G";
}

function formatCount(n) {
  if (n == null) return "0";
  var num = Number(n);
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toLocaleString("en-US");
}

function toJalaliNumeric(isoStr) {
  if (!isoStr) return "---";
  var parts = isoStr.split("T")[0].split("-");
  if (parts.length < 3) return isoStr;

  var gYear = parseInt(parts[0]);
  var gMonth = parseInt(parts[1]);
  var gDay = parseInt(parts[2]);

  var gDaysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var jDaysInMonth = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];

  function isGregorianLeap(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  var gy = gYear - 1600;
  var gm = gMonth - 1;
  var gd = gDay - 1;

  var gDayNo =
    365 * gy +
    Math.floor((gy + 3) / 4) -
    Math.floor((gy + 99) / 100) +
    Math.floor((gy + 399) / 400);

  for (var i = 0; i < gm; i++) {
    gDayNo += gDaysInMonth[i];
  }
  if (gm > 1 && isGregorianLeap(gYear)) {
    gDayNo++;
  }
  gDayNo += gd;

  var jDayNo = gDayNo - 79;
  var jNp = Math.floor(jDayNo / 12053);
  jDayNo = jDayNo % 12053;
  var jy = 979 + 33 * jNp + 4 * Math.floor(jDayNo / 1461);
  jDayNo = jDayNo % 1461;

  if (jDayNo >= 366) {
    jy += Math.floor((jDayNo - 1) / 365);
    jDayNo = (jDayNo - 1) % 365;
  }

  var jm = 0;
  var jd = 0;
  for (var k = 0; k < 12; k++) {
    if (jDayNo < jDaysInMonth[k]) {
      jm = k + 1;
      jd = jDayNo + 1;
      break;
    }
    jDayNo -= jDaysInMonth[k];
  }

  var jmStr = String(jm);
  if (jmStr.length < 2) jmStr = "0" + jmStr;
  var jdStr = String(jd);
  if (jdStr.length < 2) jdStr = "0" + jdStr;
  return jy + "/" + jmStr + "/" + jdStr;
}

// ── Image Export ──
function exportLabelImage(id, simple) {
  ensureHtml2canvas(function () {
    var targetId = simple ? "labelPreviewSimple" : "labelPreview";
    var target = document.getElementById(targetId);
    if (!target) { toast("عنصر لیبل پیدا نشد", "error"); return; }

    html2canvas(target, {
      scale: 3,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
    }).then(function (canvas) {
      var link = document.createElement("a");
      link.download = id + (simple ? "-simple" : "") + ".png";
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast("عکس با موفقیت ذخیره شد <i class='fas fa-check-circle'></i>", "success");
    }).catch(function (e) {
      toast("خطا در ساخت عکس: " + e.message, "error");
    });
  });
}

// ── Rotated Export ──
function exportLabelRotated(id, simple) {
  ensureHtml2canvas(function () {
    var targetId = simple ? "labelPreviewSimple" : "labelPreview";
    var target = document.getElementById(targetId);
    if (!target) { toast("عنصر لیبل پیدا نشد", "error"); return; }

    html2canvas(target, {
      scale: 3,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
    }).then(function (canvas) {
      var rotated = document.createElement("canvas");
      rotated.width = canvas.height;
      rotated.height = canvas.width;
      var ctx = rotated.getContext("2d");
      ctx.translate(rotated.width / 2, rotated.height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

      var link = document.createElement("a");
      link.download = id + (simple ? "-simple" : "") + "-rotated.png";
      link.href = rotated.toDataURL("image/png");
      link.click();
      toast("عکس چرخیده با موفقیت ذخیره شد <i class='fas fa-check-circle'></i>", "success");
    }).catch(function (e) {
      toast("خطا در ساخت عکس: " + e.message, "error");
    });
  });
}

// ── CSV Copy ──
function copyLabelCSV(id) {
  ensureHtml2canvas(function () {
    apiGet("/drive/" + encodeURIComponent(id)).then(function (d) {
      if (d.error) { toast(d.error, "error"); return; }
      var jalali = toJalaliNumeric(d.date_added);
      var lines = [];
      lines.push("Title,ID,Physical Mark,Date (Shamsi),Path,Capacity (GB),Used (GB),Files,Folder Name,Folder Size (GB),Files in Folder");
      var base = [
        '"' + (d.title || "").replace(/"/g, '""') + '"',
        '"' + (d.id || "") + '"',
        '"' + (d.physical_mark || "").replace(/"/g, '""') + '"',
        '"' + jalali + '"',
        '"' + (d.path || "").replace(/"/g, '""') + '"',
        d.capacity_gb || 0,
        d.used_space_gb || 0,
        d.total_files || 0,
      ].join(",");
      var contents = d.contents || [];
      if (contents.length === 0) {
        lines.push(base + ',"","",""');
      } else {
        contents.forEach(function (f) {
          lines.push(base + ',"' + (f.name || "").replace(/"/g, '""') + '",' + (f.size_gb || 0) + "," + (f.file_count || 0));
        });
      }
      var csv = "\uFEFF" + lines.join("\n");

      navigator.clipboard.writeText(csv).then(function () {
        toast("اطلاعات بصورت CSV کپی شد <i class='fas fa-check-circle'></i>", "success");
      }).catch(function () {
        var ta = document.createElement("textarea");
        ta.value = csv;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        toast("اطلاعات بصورت CSV کپی شد <i class='fas fa-check-circle'></i>", "success");
      });
    }).catch(function (e) {
      toast("خطا: " + e.message, "error");
    });
  });
}