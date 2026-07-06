// ─── SEARCH ────────────────────────────────────────────────

var searchTimeout = null;

function onSearchInput(el) {
  clearTimeout(searchTimeout);
  var q = el.value.trim();
  if (q.length < 2) {
    document.getElementById("searchResults").innerHTML = renderEmptyState("", true);
    return;
  }
  searchTimeout = setTimeout(function () {
    doSearch(q);
  }, 300);
}

function renderEmptyState(msg, isDefault) {
  if (isDefault) {
    return '<div class="search-empty"><div class="search-empty-icon"><i class="fas fa-search fa-3x"></i></div><p>برای جستجو، عبارت مورد نظرت رو تایپ کن</p><p class="hint">جستجو در عنوان هارد، برچسب فیزیکی، Volume Name، پوشه‌ها و فایل‌های ایندکس شده انجام میشه</p></div>';
  }
  return (
    '<div class="search-empty"><div class="search-empty-icon"><i class="fas fa-search fa-3x"></i></div><p>' +
    esc(msg || "نتیجه‌ای پیدا نشد") +
    '</p><p class="hint">عبارت دیگه‌ای رو امتحان کن</p></div>'
  );
}

async function doSearch(q) {
  var container = document.getElementById("searchResults");
  container.innerHTML =
    '<div class="progress active"><div class="spinner"></div><p>در حال جستجو...</p></div>';

  try {
    var data = await apiGet("/search?q=" + encodeURIComponent(q));
    var results = data.results || [];
    var fileMatches = data.file_matches || 0;

    if (results.length === 0) {
      container.innerHTML = renderEmptyState("نتیجه‌ای پیدا نشد", false);
      return;
    }

    // ── Compute total folder matches ──
    var folderMatches = 0;
    results.forEach(function (r) {
      if (r.folder_matches) folderMatches += r.folder_matches.length;
    });

    // ── Summary bar ──
    var html = '<div class="search-summary">';
    html += '<span class="search-summary-icon"><i class="fas fa-search"></i></span>';
    html += '<span><strong>' + results.length + '</strong> هارد';
    if (results.length > 1) html += ' مختلف';
    html += ' برای «<strong>' + esc(q) + '»</strong></span>';
    var counterParts = [];
    if (folderMatches > 0) counterParts.push('<i class="fas fa-folder-open"></i> ' + folderMatches + ' پوشه');
    if (fileMatches > 0) counterParts.push('<i class="fas fa-file"></i> ' + fileMatches + ' فایل');
    if (counterParts.length > 0) {
      html += '<span class="search-summary-files">' + counterParts.join(' · ') + ' پیدا شد</span>';
    }
    html += '</div>';

    // ── Results ──
    results.forEach(function (r) {
      html += buildDriveResultCard(r, q);
    });

    container.innerHTML = html;

    // ── Attach event listeners for expand/collapse ──
    setTimeout(attachSearchEvents, 50);
  } catch (e) {
    console.error(e);
    container.innerHTML =
      '<div class="search-empty"><p style="color:var(--red);">خطا در جستجو. آیا سرور اجراست؟</p></div>';
  }
}

function buildDriveResultCard(r, query) {
  var card = '<div class="search-card" data-drive-id="' + escAttr(r.drive_id) + '">';
  var q = (query || "").toLowerCase();

  // ── Header ──
  card += '<div class="search-card-header">';
  card += '<div class="search-card-title-area">';
  var id = r.drive_id;

  // Drive title + ID badge inline in a flex row
  var title = r.title || "بدون عنوان";
  if (r.title_hit && q) {
    title = highlightMatch(title, q);
  }
  card += '<div class="search-card-title-row">';
  // عنوان هارد + شماره یونیک (ID) در کنار هم
  card += '<div class="search-card-title-group">';
  card += '<span class="search-card-title"><i class="fas fa-hdd"></i> ' + title + '</span>';
  card += '<span class="search-card-id-badge" title="شناسه یکتای هارد">' + esc(id || "") + '</span>';
  card += '</div>';
  card += '</div>';

  // Match tags
  var tagHtml = "";
  if (r.title_hit) tagHtml += '<span class="search-tag title-tag"><i class="fas fa-tag"></i> عنوان</span>';
  if (r.mark_hit) tagHtml += '<span class="search-tag mark-tag"><i class="fas fa-bookmark"></i> برچسب</span>';
  if (r.vol_hit) tagHtml += '<span class="search-tag vol-tag"><i class="fas fa-compact-disc"></i> Volume</span>';
  if (r.id_hit) {
    tagHtml += '<span class="search-tag id-tag"><i class="fas fa-barcode"></i> شناسه</span>';
  }
  if (r.folder_matches && r.folder_matches.length > 0) {
    tagHtml += '<span class="search-tag folder-tag"><i class="fas fa-folder-open"></i> ' + r.folder_matches.length + ' پوشه</span>';
  }
  if (r.file_matches && r.file_matches.length > 0) {
    tagHtml += '<span class="search-tag file-tag"><i class="fas fa-file"></i> ' + r.file_matches.length + ' فایل</span>';
  }
  if (tagHtml) {
    card += '<div class="search-card-tags">' + tagHtml + '</div>';
  }
  card += '</div>';

  // Toggle button
  card +=
    '<button class="btn small search-toggle-btn" data-drive-id="' +
    escAttr(id) +
    '" id="stbtn-' +
    escAttr(id) +
    '"><i class="fas fa-chevron-left"></i> نمایش جزئیات</button>';
  card += '</div>';

  // ── Meta info (always visible) ──
  card += '<div class="search-card-meta">';
  if (r.physical_mark) {
    card += '<span><i class="fas fa-tag"></i> ' + esc(r.physical_mark) + '</span>';
  }
  if (r.volume_name) {
    var vol = r.volume_name;
    if (r.vol_hit && q) vol = highlightMatch(vol, q);
    card += '<span><i class="fas fa-compact-disc"></i> ' + vol + '</span>';
  }
  card += '<span><i class="fas fa-hdd"></i> ' + (r.used_space_gb || 0) + ' / ' + (r.capacity_gb || 0) + ' GB</span>';
  card += '<span><i class="fas fa-folder"></i> ' + (r.total_files || 0) + ' فایل</span>';
  card += '<span><i class="fas fa-calendar"></i> ' + esc(toJalali(r.date_added)) + '</span>';
  if (r.scan_type) {
    var scanLabel = r.scan_type === "deep" ? "عمیق" : "سریع";
    var scanIcon = r.scan_type === "deep" ? "microscope" : "bolt";
    card += '<span class="scan-tag ' + esc(r.scan_type) + '"><i class="fas fa-' + scanIcon + '"></i> ' + scanLabel + '</span>';
  }
  card += '</div>';

  // ── Detail panel (hidden by default) ──
  card += '<div class="search-detail" id="sdetail-' + escAttr(id) + '" style="display:none;">';

    // Folder matches — each with its own "open" button
    if (r.folder_matches && r.folder_matches.length > 0) {
      card += '<div class="search-section">';
      card += '<div class="search-section-title"><i class="fas fa-folder-open"></i> پوشه‌های منطبق (' + r.folder_matches.length + ')</div>';
      card += '<div class="search-folder-list" dir="rtl">';
      r.folder_matches.forEach(function (f) {
        var name = f.name;
        if (q) name = highlightMatch(name, q);
        var folderPath = f.name || "";
        card +=
          '<div class="search-folder-item">' +
          '<div class="search-folder-info">' +
          '<span class="search-folder-name"><i class="fas fa-folder"></i> ' + name + '</span>' +
          '<span class="search-folder-meta">' +
          formatFolderStats(f.size_gb, f.file_count) +
          '</span>' +
          '</div>' +
          '<button class="btn tiny search-open-btn" data-drive-id="' + escAttr(id) + '" data-folder="' + escAttr(folderPath) + '"><i class="fas fa-folder-open"></i> باز کردن</button>' +
          '</div>';
      });
    card += '</div></div>';
  }

  // File matches — each with its own "open folder" button
  if (r.file_matches && r.file_matches.length > 0) {
    card += '<div class="search-section">';
    card += '<div class="search-section-title"><i class="fas fa-file"></i> فایل‌های منطبق (' + r.file_matches.length + ')</div>';
    card += '<div class="search-file-list" dir="rtl">';

    var maxShow = Math.min(r.file_matches.length, 30);
    for (var i = 0; i < maxShow; i++) {
      var f = r.file_matches[i];
      var fName = f.name;
      if (q) fName = highlightMatch(fName, q);
      var fileFolder = f.folder || "";
      var fp = f.path || "";

      card += '<div class="search-file-item">';
      card += '<div class="search-file-info">';
      card += '<span class="search-file-name" title="' + escAttr(fp) + '"><i class="fas fa-file"></i> ' + fName + '</span>';
      if (fileFolder) {
        card += '<span class="search-file-folder"><i class="fas fa-folder"></i> در ' + esc(fileFolder) + '</span>';
      }
      card += '</div>';
      var openTarget = fileFolder || fp;
      card += '<button class="btn tiny search-open-btn" data-drive-id="' + escAttr(id) + '" data-folder="' + escAttr(openTarget) + '"><i class="fas fa-folder-open"></i> باز کردن پوشه</button>';
      card += '</div>';
    }

    if (r.file_matches.length > maxShow) {
      card += '<div class="search-file-more">... و ' + (r.file_matches.length - maxShow) + ' فایل دیگر</div>';
    }

    card += '</div></div>';
  }

  // Actions
  card += '<div class="search-actions">';
  card +=
    '<button class="btn small primary search-detail-btn" data-drive-id="' +
    escAttr(id) +
    '"><i class="fas fa-info-circle"></i> مشاهده جزئیات کامل</button>';
  card +=
    '<button class="btn small search-open-btn" data-drive-id="' +
    escAttr(id) +
    '" data-folder=""><i class="fas fa-folder-open"></i> باز کردن ریشه هارد</button>';
  card += '</div>';

  card += '</div>'; // end search-detail

  card += '</div>'; // end search-card

  return card;
}

function toggleSearchDetail(driveId) {
  var detail = document.getElementById("sdetail-" + driveId);
  var btn = document.getElementById("stbtn-" + driveId);
  if (!detail || !btn) return;

  if (detail.style.display === "none" || detail.style.display === "") {
    detail.style.display = "block";
    btn.innerHTML = '<i class="fas fa-chevron-down"></i> مخفی کردن';
  } else {
    detail.style.display = "none";
    btn.innerHTML = '<i class="fas fa-chevron-left"></i> نمایش جزئیات';
  }
}

function openSearchFolder(driveId, folderPath) {
  if (!driveId) {
    toast("<i class='fas fa-exclamation-triangle'></i> اطلاعات ناقص برای باز کردن", "error");
    return;
  }
  var normPath = folderPath || "";
  var encoded = encodeURIComponent(normPath.replace(/\\/g, "/"));
  apiGet("/drive/" + encodeURIComponent(driveId) + "/open/" + encoded + "?folder=1")
    .then(function (res) {
      if (res && res.error) {
        // اگر ارور از سرور اومد، پیشنهاد بدیم هارد رو دوباره متصل کنه یا مسیر رو چک کنه
        if (res.error.includes("not found") || res.error.includes("NotFound") || res.error.includes("exist")) {
          toast("<i class='fas fa-exclamation-triangle'></i> هارد پیدا نشد. مطمئن شو هارد متصله و مسیرش (" + esc(folderPath || "ریشه") + ") درسته.", "error");
        } else {
          toast("<i class='fas fa-exclamation-triangle'></i> " + res.error, "error");
        }
      } else {
        toast("<i class='fas fa-check-circle'></i> پوشه باز شد", "success");
      }
    })
    .catch(function () {
      toast("<i class='fas fa-exclamation-triangle'></i> خطا در ارتباط با سرور. آیا سرور اجراست؟", "error");
    });
}

function formatFolderStats(sizeGb, fileCount) {
  var size = (sizeGb != null ? Number(sizeGb) : 0);
  var count = (fileCount != null ? Number(fileCount) : 0);
  if (size <= 0 && count <= 0) return '<i class="fas fa-folder"></i> (بدون آمار دقیق)';
  var parts = [];
  if (size > 0) parts.push(size + ' GB');
  if (count > 0) parts.push(count + ' فایل');
  return parts.join(' · ');
}

function highlightMatch(text, query) {
  if (!query) return esc(text);
  var escaped = esc(text);
  var qEsc = esc(query);
  var regex = new RegExp("(" + qEsc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
  return escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
}

function escAttr(s) {
  if (!s) return "";
  var amp = String.fromCharCode(38);
  return String(s).replace(/&/g, amp + "amp;").replace(/\"/g, amp + "quot;").replace(/</g, amp + "lt;").replace(/>/g, amp + "gt;");
}

function handleCardClick(e) {
  var tag = e.target.tagName.toLowerCase();
  if (tag === "button" || tag === "a") return;
  var detail = e.target.closest(".search-detail");
  if (detail && detail.style.display !== "none" && detail.style.display !== "") return;
  if (e.target.closest(".btn")) return;

  var card = e.target.closest(".search-card");
  if (!card) return;
  var driveId = card.getAttribute("data-drive-id");
  if (driveId) toggleSearchDetail(driveId);
}

function attachSearchEvents() {
  document.querySelectorAll(".search-card").forEach(function (card) {
    card.removeEventListener("click", handleCardClick);
    card.addEventListener("click", handleCardClick);
  });
  document.querySelectorAll(".search-toggle-btn").forEach(function (btn) {
    btn.removeEventListener("click", handleToggleClick);
    btn.addEventListener("click", handleToggleClick);
  });
  document.querySelectorAll(".search-detail-btn").forEach(function (btn) {
    btn.removeEventListener("click", handleDetailClick);
    btn.addEventListener("click", handleDetailClick);
  });
  document.querySelectorAll(".search-open-btn").forEach(function (btn) {
    btn.removeEventListener("click", handleOpenClick);
    btn.addEventListener("click", handleOpenClick);
  });
}

function handleToggleClick(e) {
  e.stopPropagation();
  var driveId = this.getAttribute("data-drive-id");
  if (driveId) toggleSearchDetail(driveId);
}

function handleDetailClick(e) {
  e.stopPropagation();
  var driveId = this.getAttribute("data-drive-id");
  if (driveId) showDriveDetail(driveId);
}

function handleOpenClick(e) {
  e.stopPropagation();
  var driveId = this.getAttribute("data-drive-id");
  var folderPath = this.getAttribute("data-folder");
  if (driveId) openSearchFolder(driveId, folderPath);
}