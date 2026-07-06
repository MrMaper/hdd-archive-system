/**
 * Duplicates Finder - Frontend Logic
 * Features:
 * - Open in Explorer
 * - RTL→LTR path display
 * - Live search + drive filter
 * - Dynamic original selection (⭐ حفظ این نسخه)
 * - Offline drive protection
 * - Keyboard: Enter on search triggers filter
 */

let allDuplicates = [];
let loaded = false;
let lastFetchedDriveId = null; // tracks which drive was used in the last server fetch

/* ============================================================
   1. LOAD & RENDER
   ============================================================ */
async function loadDuplicates() {
  const container = document.getElementById("duplicatesContent");
  container.innerHTML = `
    <div class="duplicates-loading">
      <div class="spinner"></div>
      <p>در حال جستجوی فایل‌های تکراری...</p>
    </div>`;

  try {
    // Send selected drive_id filter to server for faster processing
    const driveFilter = document.getElementById("dupDriveFilter");
    let url = "/api/duplicates";
    if (driveFilter && driveFilter.value) {
      url += "?drive_id=" + encodeURIComponent(driveFilter.value);
    }
    const resp = await fetch(url);
    const data = await resp.json();

    if (data.error) {
      container.innerHTML = `<div class="duplicates-empty"><div class="icon"><i class="fas fa-exclamation-triangle"></i></div><p>${escapeHtml(data.error)}</p></div>`;
      return;
    }

    allDuplicates = data.duplicates || [];
    loaded = true;
    // Remember which drive was used for this fetch (empty string = all drives)
    lastFetchedDriveId = (driveFilter && driveFilter.value) ? driveFilter.value : "";

    // Populate drive filter dropdown from results
    populateDriveFilterFromResults(allDuplicates);

    // Enable filter controls now that data is available
    const typeFilterEl = document.getElementById("dupTypeFilter");
    const searchInputEl = document.getElementById("dupSearchInput");
    if (typeFilterEl) typeFilterEl.disabled = false;
    if (searchInputEl) searchInputEl.disabled = false;

    renderDuplicates(allDuplicates);
  } catch (e) {
    container.innerHTML = `<div class="duplicates-empty"><div class="icon"><i class="fas fa-exclamation-triangle"></i></div><p>خطا: ${escapeHtml(e.message)}</p></div>`;
  }
}

/* ============================================================
   2. POPULATE DRIVE FILTER DROPDOWN (ON PAGE LOAD)
   ============================================================ */
async function populateDriveFilterOnLoad() {
  const sel = document.getElementById("dupDriveFilter");
  if (!sel) return;
  // Fetch drive list from API and populate dropdown immediately, before any scan
  try {
    const resp = await fetch("/api/drives");
    const data = await resp.json();
    const drives = data.drives || [];
    // Keep "همه" option, remove any stale options
    sel.innerHTML = '<option value="">همه هاردها</option>';
    drives.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.title + " (" + d.id + ")";
      sel.appendChild(opt);
    });
  } catch (e) {
    // Silently fail — dropdown will remain with just "همه" option
  }
}

/* ============================================================
   2b. POPULATE DRIVE FILTER FROM SEARCH RESULTS (LEGACY)
   ============================================================ */
function populateDriveFilterFromResults(dups) {
  const sel = document.getElementById("dupDriveFilter");
  if (!sel || sel.options.length > 1) return; // already populated from on-load
  const currentVal = sel.value;
  // Collect unique drive titles
  const driveSet = new Set();
  dups.forEach((g) => {
    (g.locations || []).forEach((loc) => {
      driveSet.add(loc.drive_title || loc.drive_id);
    });
  });
  // Sort alphabetically
  const drives = Array.from(driveSet).sort((a, b) => a.localeCompare(b, "fa"));
  // Keep the "همه" option, remove others then re-add
  sel.innerHTML = '<option value="">همه هاردها</option>';
  drives.forEach((title) => {
    const opt = document.createElement("option");
    opt.value = title;
    opt.textContent = title;
    sel.appendChild(opt);
  });
  // Restore selection if possible
  if (currentVal && drives.includes(currentVal)) {
    sel.value = currentVal;
  }
}

/* ============================================================
   3. SEARCH & FILTER
   ============================================================ */
const FILE_TYPE_EXTENSIONS = {
  video: [".mp4", ".mkv", ".mov", ".avi", ".wmv", ".flv", ".webm", ".m4v", ".3gp", ".ts", ".mts"],
  image: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif", ".svg", ".ico", ".heic", ".heif"],
  audio: [".mp3", ".wav", ".flac", ".aac", ".ogg", ".wma", ".m4a", ".opus", ".alac"],
  document: [".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".txt", ".csv", ".md", ".rtf", ".epub", ".odt"],
};

function getFileType(fileName) {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  for (const [type, exts] of Object.entries(FILE_TYPE_EXTENSIONS)) {
    if (exts.includes(ext)) return type;
  }
  return "other";
}

function filterDuplicates() {
  if (!loaded) return;
  const query = document.getElementById("dupSearchInput").value.trim().toLowerCase();
  const driveFilter = document.getElementById("dupDriveFilter").value;
  const typeFilter = document.getElementById("dupTypeFilter").value;

  let filtered = allDuplicates;

  // Filter by drive title — only if the current dropdown selection differs from
  // the drive that was already used to fetch data from the server.  If they
  // match the data is already scoped to that drive and we skip the client-side
  // drive filter so that the type / text filters work on the full result-set.
  if (driveFilter && driveFilter !== lastFetchedDriveId) {
    filtered = filtered.filter((g) =>
      (g.locations || []).some((loc) => (loc.drive_title || loc.drive_id) === driveFilter)
    );
  }

  // Filter by file type
  if (typeFilter) {
    filtered = filtered.filter((g) => {
      return getFileType(g.file_name) === typeFilter;
    });
  }

  // Filter by search query (file name or path)
  if (query) {
    filtered = filtered.filter((g) => {
      const nameMatch = g.file_name.toLowerCase().includes(query);
      const pathMatch = (g.locations || []).some((loc) =>
        (loc.file_path || "").toLowerCase().includes(query) ||
        (loc.drive_title || "").toLowerCase().includes(query)
      );
      return nameMatch || pathMatch;
    });
  }

  renderDuplicates(filtered);
}

/* ============================================================
   4. RENDER DUPLICATES (accordion list)
   ============================================================ */
function renderDuplicates(dupList) {
  const container = document.getElementById("duplicatesContent");

  if (!dupList || dupList.length === 0) {
    container.innerHTML = `<div class="duplicates-empty"><div class="icon"><i class="fas fa-check-circle" style="color:var(--green)"></i></div><p>فایل تکراری‌ای یافت نشد!</p></div>`;
    return;
  }

  // Count total wasted space (sum of all copies except 1 per group)
  let totalWasted = 0;
  dupList.forEach((g) => {
    if (g.locations && g.locations.length > 1) {
      totalWasted += (g.locations.length - 1) * g.size_bytes;
    }
  });
  const wastedGb = (totalWasted / (1024 ** 3)).toFixed(2);

  // Summary
  let html = `
    <div class="duplicates-summary">
      <i class="fas fa-info-circle"></i>
      <strong>${dupList.length}</strong> گروه فایل تکراری یافت شد.
      فضای هدر رفته: <strong>${wastedGb}</strong> گیگابایت
    </div>
    <div class="duplicates-list">`;

  dupList.forEach((group, idx) => {
    const sizeStr = formatSize(group.size_bytes);
    const count = group.locations ? group.locations.length : 0;

    // Determine which location is the "original" (first connected one, or first one)
    const originalIdx = findOriginalIndex(group.locations);

    html += `
      <div class="duplicate-group" data-group-index="${idx}">
        <div class="duplicate-group-header" onclick="toggleGroup(this)" data-group="${idx}">
          <span class="expand-icon"><i class="fas fa-chevron-left"></i></span>
          <div class="file-info">
            <span class="file-name">${escapeHtml(group.file_name)}</span>
            <span class="file-size"><span dir="ltr" style="display: inline-block; direction: ltr;">${sizeStr}</span></span>
          </div>
          <span class="copy-count">${count} نسخه</span>
          <button class="btn-dup-ignore" onclick="event.stopPropagation(); ignoreDuplicate(${idx})" title="نادیده گرفتن این گروه (دیگر در نتایج نمایش داده نمی‌شود)"><i class="fas fa-eye-slash"></i></button>
        </div>
        <div class="duplicate-locations">`;

    group.locations.forEach((loc, locIdx) => {
      const isOriginal = locIdx === originalIdx;
      const isConnected = loc.is_connected !== false; // default true if missing
      const driveTitle = escapeHtml(loc.drive_title || loc.drive_id || "نامشخص");
      const filePath = escapeHtml(loc.file_path || "");
      const driveId = escapeHtml(loc.drive_id || "");

      let badgeHtml = "";
      if (isOriginal) {
        badgeHtml = `<span class="dup-loc-badge" style="background:rgba(243,156,18,0.15);color:#f39c12;border:1px solid rgba(243,156,18,0.3);"><i class="fas fa-star"></i> نسخه اصلی</span>`;
      }

      let offlineHtml = "";
      if (!isConnected) {
        offlineHtml = `<span class="dup-offline-badge"><i class="fas fa-plug"></i> هارد آفلاین</span>`;
      }

      const itemClass = !isConnected ? "duplicate-location-item dup-offline" : "duplicate-location-item";

      html += `
        <div class="${itemClass}" data-drive-id="${driveId}" data-file-path="${encodeURIComponent(filePath)}" data-loc-idx="${locIdx}">
          <div class="dup-loc-info">
            <span class="dup-loc-drive">${driveTitle} ${badgeHtml} ${offlineHtml}</span>
            <span class="dup-loc-path ltr-text">${filePath}</span>
          </div>
          <div class="dup-location-actions">
            ${isConnected ? `<button class="btn-dup-open" onclick="openFileLocation('${driveId}','${encodeURIComponent(filePath)}')" title="باز کردن در Explorer"><i class="fas fa-folder-open"></i></button>` : `<button class="btn-dup-open" disabled title="هارد متصل نیست"><i class="fas fa-folder-open"></i></button>`}
            ${isConnected && !isOriginal ? `<button class="btn-dup-keep" onclick="keepAsOriginal(${idx},${locIdx})" title="این نسخه را به عنوان نسخه اصلی نگه دار"><i class="fas fa-star"></i> ⭐ حفظ این نسخه</button>` : ""}
            ${!isOriginal && isConnected ? `<button class="dup-delete-btn" onclick="deleteDuplicate('${driveId}','${encodeURIComponent(filePath)}',this)" title="حذف فیزیکی فایل"><i class="fas fa-trash"></i> 🗑️ حذف</button>` : ""}
            ${!isConnected ? `<button class="dup-delete-btn" disabled title="هارد متصل نیست"><i class="fas fa-trash"></i> 🗑️ حذف</button>` : ""}
          </div>
        </div>`;
    });

    html += `</div></div>`;
  });

  html += `</div>`;
  container.innerHTML = html;
}

/* ============================================================
   5. FIND ORIGINAL INDEX
   ============================================================ */
function findOriginalIndex(locations) {
  if (!locations || locations.length === 0) return 0;
  // First connected location is original
  for (let i = 0; i < locations.length; i++) {
    if (locations[i].is_connected !== false) return i;
  }
  return 0; // all offline, first one is "original" by default
}

/* ============================================================
   6. TOGGLE ACCORDION
   ============================================================ */
function toggleGroup(headerEl) {
  headerEl.classList.toggle("expanded");
  const locations = headerEl.nextElementSibling;
  if (locations) {
    locations.classList.toggle("expanded");
  }
}

/* ============================================================
   7. OPEN IN EXPLORER
   ============================================================ */
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

/* ============================================================
   8. KEEP AS ORIGINAL (swap which copy is the "original")
   ============================================================ */
async function keepAsOriginal(groupIdx, newOriginalLocIdx) {
  const group = allDuplicates[groupIdx];
  if (!group || !group.locations) return;

  const loc = group.locations[newOriginalLocIdx];
  if (!loc) return;

  // Check if this drive is connected
  if (loc.is_connected === false) {
    showToast("❌ این هارد متصل نیست. ابتدا هارد را متصل کنید.", "error");
    return;
  }

  // Re-arrange: move this location to front of the array
  const locs = group.locations;
  const [item] = locs.splice(newOriginalLocIdx, 1);
  locs.unshift(item);

  // Re-render to reflect change
  const query = document.getElementById("dupSearchInput").value.trim().toLowerCase();
  const driveFilter = document.getElementById("dupDriveFilter").value;
  const typeFilter = document.getElementById("dupTypeFilter").value;

  let filtered = allDuplicates;
  if (driveFilter) {
    filtered = filtered.filter((g) =>
      (g.locations || []).some((loc) => (loc.drive_title || loc.drive_id) === driveFilter)
    );
  }
  if (typeFilter) {
    filtered = filtered.filter((g) => getFileType(g.file_name) === typeFilter);
  }
  if (query) {
    filtered = filtered.filter((g) => {
      const nameMatch = g.file_name.toLowerCase().includes(query);
      const pathMatch = (g.locations || []).some((loc) =>
        (loc.file_path || "").toLowerCase().includes(query) ||
        (loc.drive_title || "").toLowerCase().includes(query)
      );
      return nameMatch || pathMatch;
    });
  }

  renderDuplicates(filtered);
  showToast("⭐ نسخه اصلی تغییر یافت: " + (loc.drive_title || loc.drive_id), "success");
}

/* ============================================================
   9. DELETE A DUPLICATE COPY
   ============================================================ */
async function deleteDuplicate(driveId, filePathEncoded, btnEl) {
  const filePath = decodeURIComponent(filePathEncoded);

  if (!confirm("⚠️ آیا مطمئن هستید؟ این فایل به صورت فیزیکی حذف خواهد شد!")) {
    return;
  }

  btnEl.disabled = true;
  btnEl.textContent = "در حال حذف...";

  try {
    const resp = await fetch("/api/delete-file", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drive_id: driveId, file_path: filePath }),
    });

    const data = await resp.json();

    if (data.error) {
      showToast("❌ " + data.error, "error");
      btnEl.disabled = false;
      btnEl.innerHTML = '<i class="fas fa-trash"></i> 🗑️ حذف';
      return;
    }

    // Remove this location item from DOM
    const locItem = btnEl.closest(".duplicate-location-item");
    if (locItem) {
      locItem.remove();
    }

    // Also remove from allDuplicates data
    for (let i = 0; i < allDuplicates.length; i++) {
      const g = allDuplicates[i];
      const locIdx = (g.locations || []).findIndex(
        (l) => l.drive_id === driveId && l.file_path === filePath
      );
      if (locIdx !== -1) {
        g.locations.splice(locIdx, 1);
        if (g.locations.length < 2) {
          // Group no longer has duplicates, remove the whole card
          allDuplicates.splice(i, 1);
          // Remove the DOM card
          const groupCard = locItem ? locItem.closest(".duplicate-group") : null;
          if (groupCard) {
            groupCard.remove();
          }
        }
        break;
      }
    }

    // Update the copy count badge if group still exists
    const groupCard = locItem ? locItem.closest(".duplicate-group") : null;
    if (groupCard) {
      const badge = groupCard.querySelector(".copy-count");
      const remainingLocs = groupCard.querySelectorAll(".duplicate-location-item");
      if (badge && remainingLocs) {
        badge.textContent = remainingLocs.length + " نسخه";
      }
    }

    // Update summary if needed
    refreshSummary();

    showToast("✅ فایل با موفقیت حذف شد", "success");
  } catch (e) {
    showToast("❌ خطا: " + e.message, "error");
    btnEl.disabled = false;
    btnEl.innerHTML = '<i class="fas fa-trash"></i> 🗑️ حذف';
  }
}

/* ============================================================
   10. REFRESH SUMMARY
   ============================================================ */
function refreshSummary() {
  const summary = document.querySelector(".duplicates-summary");
  if (!summary) return;

  // Recalculate from remaining DOM + data
  const groups = document.querySelectorAll(".duplicate-group");
  const count = groups.length;

  let totalWasted = 0;
  allDuplicates.forEach((g) => {
    if (g.locations && g.locations.length > 1) {
      totalWasted += (g.locations.length - 1) * g.size_bytes;
    }
  });
  const wastedGb = (totalWasted / (1024 ** 3)).toFixed(2);

  summary.innerHTML = `
    <i class="fas fa-info-circle"></i>
    <strong>${count}</strong> گروه فایل تکراری یافت شد.
    فضای هدر رفته: <strong>${wastedGb}</strong> گیگابایت`;
}

/* ============================================================
   11. KEYBOARD SUPPORT (Enter on search)
   ============================================================ */
document.addEventListener("DOMContentLoaded", function () {
  const searchInput = document.getElementById("dupSearchInput");
  if (searchInput) {
    searchInput.disabled = true;
    searchInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        filterDuplicates();
      }
    });
  }

  const typeFilter = document.getElementById("dupTypeFilter");
  if (typeFilter) {
    typeFilter.disabled = true;
    typeFilter.addEventListener("change", function () {
      filterDuplicates();
    });
  }
});

/* ============================================================
   HELPERS
   ============================================================ */
function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return "۰ B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  // Format with Persian digits
  const numStr = size.toFixed(i > 0 ? 2 : 0);
  return numStr.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[parseInt(d)]) + " " + units[i];
}

/* ============================================================
   12. IGNORE DUPLICATE GROUP
   ============================================================ */
async function ignoreDuplicate(groupIdx) {
  const group = allDuplicates[groupIdx];
  if (!group) return;

  if (!confirm(`"${group.file_name}" (${formatSize(group.size_bytes)}) به لیست نادیده گرفته‌شده‌ها اضافه شود؟`)) {
    return;
  }

  try {
    const resp = await fetch("/api/ignore-duplicate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_name: group.file_name, size_bytes: group.size_bytes }),
    });
    const data = await resp.json();
    if (data.error) {
      showToast("❌ " + data.error, "error");
      return;
    }

    // Remove from allDuplicates and re-render
    allDuplicates.splice(groupIdx, 1);
    loaded = true;
    renderDuplicates(allDuplicates);
    showToast("✅ گروه نادیده گرفته شد", "success");
  } catch (e) {
    showToast("❌ خطا: " + e.message, "error");
  }
}

/* ============================================================
   13. IGNORED DUPLICATES MANAGEMENT (MODAL)
   ============================================================ */
function openIgnoredModal() {
  const overlay = document.getElementById("ignoredModalOverlay");
  const modal = document.getElementById("ignoredModal");
  const body = document.getElementById("ignoredModalBody");

  if (!overlay || !modal || !body) return;

  overlay.classList.add("active");
  modal.classList.add("active");

  body.innerHTML = `
    <div class="progress active">
      <div class="spinner"></div>
      <p>در حال بارگذاری لیست نادیده‌گرفته‌شده‌ها...</p>
    </div>`;

  fetch("/api/ignored-duplicates")
    .then((r) => r.json())
    .then((data) => {
      if (data.error) {
        body.innerHTML = `<div class="ignored-empty"><div class="icon"><i class="fas fa-exclamation-triangle" style="color:var(--red)"></i></div><p>${escapeHtml(data.error)}</p></div>`;
        return;
      }
      const items = data.items || [];
      if (items.length === 0) {
        body.innerHTML = `<div class="ignored-empty"><div class="icon"><i class="fas fa-check-circle" style="color:var(--green)"></i></div><p>هیچ فایل نادیده‌گرفته‌شده‌ای وجود ندارد</p></div>`;
        return;
      }
      let html = `<div class="ignored-list">`;
      items.forEach((item) => {
        const sizeStr = formatSize(item.size_bytes);
        html += `
          <div class="ignored-item" data-key="${escapeHtml(item.key)}">
            <div class="ignored-item-info">
              <span class="ignored-item-name">${escapeHtml(item.file_name)}</span>
              <span class="ignored-item-size">حجم: <span dir="ltr" style="display:inline-block;direction:ltr">${sizeStr}</span></span>
            </div>
            <button class="ignored-item-restore-btn" onclick="restoreIgnoredItem('${escapeHtml(item.key)}', this)">
              <i class="fas fa-undo"></i> 🔄 بازگردانی
            </button>
          </div>`;
      });
      html += `</div>`;
      body.innerHTML = html;
    })
    .catch((e) => {
      body.innerHTML = `<div class="ignored-empty"><div class="icon"><i class="fas fa-exclamation-triangle" style="color:var(--red)"></i></div><p>خطا: ${escapeHtml(e.message)}</p></div>`;
    });
}

function closeIgnoredModal() {
  const overlay = document.getElementById("ignoredModalOverlay");
  const modal = document.getElementById("ignoredModal");
  if (overlay) overlay.classList.remove("active");
  if (modal) modal.classList.remove("active");
}

async function restoreIgnoredItem(key, btnEl) {
  btnEl.disabled = true;
  btnEl.textContent = "در حال بازگردانی...";

  try {
    const resp = await fetch("/api/ignore-duplicate", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: key }),
    });
    const data = await resp.json();
    if (data.error) {
      showToast("❌ " + data.error, "error");
      btnEl.disabled = false;
      btnEl.innerHTML = '<i class="fas fa-undo"></i> 🔄 بازگردانی';
      return;
    }

    // Remove the item from modal DOM
    const itemEl = btnEl.closest(".ignored-item");
    if (itemEl) {
      itemEl.remove();
    }

    // Check if modal body is now empty
    const remaining = document.querySelectorAll(".ignored-item");
    if (remaining.length === 0) {
      const body = document.getElementById("ignoredModalBody");
      if (body) {
        body.innerHTML = `<div class="ignored-empty"><div class="icon"><i class="fas fa-check-circle" style="color:var(--green)"></i></div><p>هیچ فایل نادیده‌گرفته‌شده‌ای وجود ندارد</p></div>`;
      }
    }

    // Reload duplicates to show the restored group
    loadDuplicates();

    showToast("✅ فایل به لیست تکراری‌ها بازگردانده شد", "success");
  } catch (e) {
    showToast("❌ خطا: " + e.message, "error");
    btnEl.disabled = false;
    btnEl.innerHTML = '<i class="fas fa-undo"></i> 🔄 بازگردانی';
  }
}

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