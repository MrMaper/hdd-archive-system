// Drive listing, detail modal, edit, and delete

// ==================== DRIVE LIST ====================
async function loadDrives() {
  var container = document.getElementById("drivesList");
  try {
    var data = await apiGet("/drives");
    var drives = data.drives || [];

    if (drives.length === 0) {
      container.innerHTML =
        '<div class="empty-state"><div class="icon"><i class="fas fa-inbox fa-3x"></i></div><p>هنوز هیچ هاردی ثبت نشده</p><p style="font-size:0.8rem;margin-top:4px;">با کلیک روی «اسکن جدید» اولین هارد رو اضافه کن</p></div>';
      return;
    }

    // ===== DRAG & DROP SORTING =====
    // Restore saved order from localStorage
    var savedOrder = getDriveOrder();
    if (savedOrder && savedOrder.length > 0) {
      var driveMap = {};
      drives.forEach(function (d) { driveMap[d.id] = d; });
      var sorted = [];
      savedOrder.forEach(function (id) {
        if (driveMap[id]) {
          sorted.push(driveMap[id]);
          delete driveMap[id];
        }
      });
      // Append any new drives not in saved order
      Object.keys(driveMap).forEach(function (id) { sorted.push(driveMap[id]); });
      drives = sorted;
    }

    var html = '<div class="card-grid" id="cardGrid">';
    drives.forEach(function (d) {
      var jalaliDateTime = toJalaliDateTime(d.date_added);
      html +=
        '<div class="drive-card" draggable="true" data-drive-id="' +
        esc(d.id) +
        '" onclick="showDriveDetail(\'' +
        esc(d.id) +
        "')\">";

      // Title line (first) — title+tag grouped together, rescan pushed to end
      html += '<div class="title">';
      html += '<span class="title-group">';
      html += '<span>' + esc(d.title) + '</span>';
      if (d.scan_type === "deep") {
        html += ' <span class="scan-tag deep"><i class="fas fa-microscope"></i> عمیق</span>';
      } else if (d.scan_type === "quick") {
        html += ' <span class="scan-tag quick"><i class="fas fa-bolt"></i> سریع</span>';
      }
      html += '</span>';
      html +=
        '<button class="btn-icon-rescan" onclick="event.stopPropagation();rescanDrive(\'' +
        esc(d.id) +
        "')\" title=\"اسکن مجدد\"><i class=\"fas fa-sync\"></i></button>";
      html += "</div>";

      // ID + date on same line
      html +=
        '<div class="drive-id-line" style="display:flex;gap:10px;align-items:center;margin-bottom:5px;">' +
        '<span style="font-family:Consolas,monospace;font-size:0.73rem;color:var(--accent2);">' +
        esc(d.id) +
        '</span>' +
        '<span style="color:var(--text2);font-size:0.7rem;"><i class="fas fa-calendar"></i> ' +
        esc(jalaliDateTime) +
        "</span>" +
        "</div>";

      html += '<div class="meta">';

      var used = d.used_space_gb || 0;
      var cap = d.capacity_gb || 1;
      var pct = Math.round((used / cap) * 100);
      if (pct > 100) pct = 100;
      if (isNaN(pct)) pct = 0;
      html +=
        '<span dir="ltr" style="display:inline-block;direction:ltr"><i class="fas fa-hdd"></i> ' +
        used.toFixed(0) +
        " / " +
        cap.toFixed(0) +
        " GB</span>";
      html +=
        "<span><i class=\"fas fa-folder\"></i> " +
        (d.total_files || 0).toLocaleString() +
        " فایل</span>";
      if (d.physical_mark) {
        html += "<span><i class=\"fas fa-tag\"></i> " + esc(d.physical_mark) + "</span>";
      }
      html += "</div>";

      // Capacity bar
      html +=
        '<div style="margin-top:8px;height:4px;background:var(--border);border-radius:2px;overflow:hidden;">' +
        '<div style="height:100%;width:' +
        pct +
        '%;background:linear-gradient(90deg, var(--accent), var(--accent2));border-radius:2px;transition:width 0.3s;"></div>' +
        "</div>";

      if (d.folders && d.folders.length > 0) {
        html += '<div class="folders">';
        var folderTags = d.folders.slice(0, 8).map(function (name) {
          var ltrClass = isLatin(name) ? ' ltr-tag' : '';
          return (
            '<span class="folder-tag' + ltrClass + '" title="' +
            esc(name) +
            '">' +
            esc(name.length > 30 ? name.slice(0, 28) + '…' : name) +
            "</span>"
          );
        });
        if (d.folders.length > 8) {
          folderTags.push(
            '<span class="folder-tag" style="opacity:0.7;">+ ' +
              toPersianDigits(d.folders.length - 8) +
              " پوشه دیگر</span>"
          );
        }
        html += folderTags.join("");
        html += "</div>";
      }

      html += '<div class="actions" onclick="event.stopPropagation()">';
      html +=
        '<button class="btn small" onclick="showDriveDetail(\'' +
        esc(d.id) +
        "')\"><i class=\"fas fa-clipboard-list\"></i> جزئیات</button>";
      html +=
        '<button class="btn small" onclick="showLabel(\'' +
        esc(d.id) +
        "')\"><i class=\"fas fa-tag\"></i> لیبل</button>";
      html +=
        '<button class="btn small edit" onclick="showEditDrive(\'' +
        esc(d.id) +
        "')\"><i class=\"fas fa-pencil-alt\"></i> ویرایش</button>";
      html +=
        '<button class="btn small danger" onclick="deleteDrive(\'' +
        esc(d.id) +
        "')\"><i class=\"fas fa-trash-alt\"></i> حذف</button>";
      html += "</div>";
      html += "</div>";
    });
    html += "</div>";
    container.innerHTML = html;

    // Attach drag & drop event listeners
    setupDragDrop();
  } catch (e) {
    container.innerHTML =
      '<div class="empty-state"><p style="color:var(--red)">خطا در بارگذاری. آیا سرور اجراست؟</p></div>';
  }
}

// ==================== DRIVE DETAIL MODAL ====================
async function showDriveDetail(id) {
  try {
    var d = await apiGet("/drive/" + encodeURIComponent(id));
  } catch (e) {
    toast("خطا در دریافت اطلاعات", "error");
    return;
  }
  if (d.error) {
    toast(d.error, "error");
    return;
  }

  var jalaliDateTime = toJalaliDateTime(d.date_added);
var modal = document.createElement("div");
  modal.className = "modal-overlay active";
  modal.onclick = function (e) {
    if (e.target === modal) modal.remove();
  };

  var html = '<div class="modal active">';
  html +=
    '<button class="close-btn" style="position: absolute; top: 15px; left: 15px;" onclick="this.closest(\'.modal-overlay\').remove()"><i class="fas fa-times"></i></button>';

  // Title + ID (clickable to copy)
  html += '<div style="margin-bottom:12px;">';
  html += '<h2 style="display:inline;margin:0;"><i class="fas fa-clipboard-list"></i> ' + esc(d.title) + '</h2>';
  html +=
    ' <span class="drive-id-badge" title="کلیک کن تا کپی بشه" onclick="event.stopPropagation();copyDriveId(\'' +
    esc(d.id) +
    '\')" style="cursor:pointer;background:var(--surface2);padding:2px 10px;border-radius:12px;font-family:Consolas,monospace;font-size:0.75rem;color:var(--accent);vertical-align:middle;margin-right:8px;transition:background 0.2s;">' +
    esc(d.id) +
    '</span>';
  html += '</div>';

  // Date + physical mark on same line
  html += '<div style="margin-bottom:16px;display:flex;gap:24px;flex-wrap:wrap;align-items:center;">';
  html +=
    '<span style="color:var(--text2);"><i class="fas fa-calendar"></i> ' +
    esc(jalaliDateTime) +
    '</span>';
  if (d.physical_mark) {
    html +=
      '<span style="color:var(--text2);"><i class="fas fa-bookmark"></i> ' +
      esc(d.physical_mark) +
      '</span>';
  }
  html += '</div>';

  // Stats badges
  html +=
    '<div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap;">';
  html +=
    '<span dir="ltr" style="display:inline-block;direction:ltr"><i class="fas fa-hdd"></i> ' +
    (d.used_space_gb || 0).toFixed(0) +
    " / " +
    (d.capacity_gb || 0).toFixed(0) +
    " GB</span>";
  html +=
    '<span style="background:var(--surface2);padding:6px 14px;border-radius:20px;"><i class="fas fa-folder"></i> ' +
    (d.total_files || 0).toLocaleString() +
    " فایل</span>";
  html +=
    '<span style="background:var(--surface2);padding:6px 14px;border-radius:20px;"><i class="fas fa-folder-open"></i> ' +
    (d.folder_count || (d.contents || []).length) +
    " پوشه</span>";
  html += "</div>";

  // Volume + Path — left-aligned, clean (only show if useful)
  if (d.volume_name || d.path) {
    html += '<div style="margin-bottom:12px;padding:8px 12px;background:var(--surface2);border-radius:8px;font-size:0.78rem;color:var(--text2);direction:ltr;text-align:left;font-family:Consolas,monospace;">';
    if (d.volume_name) {
      html += '<i class="fas fa-compact-disc"></i> Volume: <b>' + esc(d.volume_name) + '</b>';
    }
    if (d.path) {
      html += (d.volume_name ? ' &nbsp;|&nbsp; ' : '') + '<i class="fas fa-map-pin"></i> Path: ' + esc(d.path);
    }
    html += '</div>';
  }

  // Folder tree — only for deep scans
  html += '<h4 style="margin-bottom:8px;"><i class="fas fa-folder-open"></i> پوشه‌ها:</h4>';
  var contents = d.contents || [];
  if (d.scan_type === "deep") {
    contents.sort(function (a, b) {
      return b.size_gb - a.size_gb;
    });
    html += '<div class="folder-tree">';
    contents.forEach(function (f, idx) {
      var fid = 'ft_' + Date.now() + '_' + idx;
      html += '<div class="ft-node">';
      html += '<div class="ft-header" data-fid="' + fid + '" data-folder="' + f.name.replace(/"/g, '"') + '" onclick="toggleFolderTree(\'' + fid + '\', \'' + f.name.replace(/'/g, "\\'") + '\')">';
      html += '<span class="ft-arrow" id="' + fid + '_arrow"><i class="fas fa-chevron-left"></i></span> ';
      html += '<span><i class="fas fa-folder"></i> ' + esc(f.name) + '</span>';
      html += '<span class="ft-size">' + f.size_gb + ' GB | ' + (f.file_count || 0).toLocaleString() + ' فایل</span>';
      html += '</div>';
      html += '<div class="ft-children" id="' + fid + '_children" style="display:none;">';
      html += '<div class="ft-loading" id="' + fid + '_loading">در حال بارگذاری...</div>';
      html += '<div class="ft-content" id="' + fid + '_content"></div>';
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
  } else {
    // Quick scan — show folder list without expand
    contents.sort(function (a, b) {
      return b.size_gb - a.size_gb;
    });
    html += '<div style="color:var(--text2);font-size:0.78rem;margin-bottom:8px;padding:4px 8px;background:var(--surface2);border-radius:6px;"><i class="fas fa-exclamation-triangle"></i> این اسکن سریع بوده — زیرپوشه‌ها قابل مرور نیستند. برای مرور کامل، اسکن عمیق بگیر.</div>';
    html += '<div class="folder-tree" style="max-height:400px;">';
    contents.forEach(function (f) {
      html += '<div class="ft-node" style="opacity:0.7;">';
      html += '<div class="ft-header" style="cursor:default;">';
      html += '<span style="min-width:14px;display:inline-block;"><i class="fas fa-folder"></i></span> ';
      html += '<span>' + esc(f.name) + '</span>';
      html += '<span class="ft-size">' + f.size_gb + ' GB | ' + (f.file_count || 0).toLocaleString() + ' فایل</span>';
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  html += '<div style="margin-top:16px;display:flex;gap:8px;">';
  html +=
    '<button class="btn primary" onclick="showLabel(\'' +
    esc(d.id) +
    "')\"><i class=\"fas fa-tag\"></i> مشاهده لیبل</button>";
  html +=
    '<button class="btn danger small" onclick="deleteDrive(\'' +
    esc(d.id) +
    "');this.closest('.modal-overlay').remove();\"><i class=\"fas fa-trash-alt\"></i> حذف</button>";
  html += "</div>";
  html += "</div>";

  modal.innerHTML = html;
  document.body.appendChild(modal);
}

// ==================== EDIT DRIVE ====================
async function showEditDrive(id) {
  try {
    var d = await apiGet("/drive/" + encodeURIComponent(id));
  } catch (e) {
    toast("خطا در دریافت اطلاعات", "error");
    return;
  }
  if (d.error) {
    toast(d.error, "error");
    return;
  }

  var formId = "editForm_" + Date.now();
  var modal = document.createElement("div");
  modal.className = "modal-overlay active";
  modal.onclick = function (e) {
    if (e.target === modal) modal.remove();
  };

  var html = '<div class="modal active">';
  html +=
    '<button class="close-btn" style="position: absolute; top: 15px; left: 15px;" onclick="this.closest(\'.modal-overlay\').remove()"><i class="fas fa-times"></i></button>';
  html += "<h2><i class=\"fas fa-pencil-alt\"></i> ویرایش اطلاعات هارد</h2>";
  html +=
    '<p style="color:var(--accent2);font-family:monospace;font-size:0.8rem;margin-bottom:16px;">' +
    esc(d.id) +
    "</p>";

  html += '<div class="input-group">';
  html += "<label>عنوان / موضوع هارد</label>";
  html +=
    '<input type="text" id="' +
    formId +
    '_title" value="' +
    esc(d.title || "") +
    '" />';
  html += "</div>";

  html += '<div class="input-group">';
  html += "<label>مشخصه فیزیکی</label>";
  html +=
    '<input type="text" id="' +
    formId +
    '_physical" value="' +
    esc(d.physical_mark || "") +
    '" />';
  html += "</div>";

html +=
    '<button class="btn primary" id="' +
    formId +
    '_save" style="width: max-content; margin-right: auto; display: block;"><i class="fas fa-save"></i> ذخیره تغییرات</button>';
  html += "</div>";

  modal.innerHTML = html;
  document.body.appendChild(modal);

  document.getElementById(formId + "_save").onclick = async function () {
    var newTitle = document.getElementById(formId + "_title").value.trim();
    var newPhysical = document
      .getElementById(formId + "_physical")
      .value.trim();

    if (!newTitle) {
      toast("عنوان نمی‌تونه خالی باشه", "error");
      return;
    }

    try {
      var r = await fetch(API + "/drive/" + encodeURIComponent(id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          physical_mark: newPhysical,
        }),
      });
      var result = await r.json();
    } catch (e) {
      toast("خطا در ارتباط با سرور", "error");
      return;
    }

    if (result.success) {
      toast("تغییرات ذخیره شد <i class='fas fa-check-circle'></i>", "success");
      modal.remove();
      loadDrives();
    } else {
      toast(result.error || "خطا در ذخیره", "error");
    }
  };
}

// ==================== COPY DRIVE ID ====================
function copyDriveId(id) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(id).then(function () {
      toast("ID کپی شد: " + id, "success");
    }).catch(function () {
      toast("نتونستم کپی کنم: " + id, "error");
    });
  } else {
    // Fallback
    var ta = document.createElement("textarea");
    ta.value = id;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      toast("ID کپی شد: " + id, "success");
    } catch (e) {
      toast("نتونستم کپی کنم", "error");
    }
    document.body.removeChild(ta);
  }
  // Flash the badge
  var badges = document.querySelectorAll(".drive-id-badge");
  badges.forEach(function (b) {
    b.style.background = "var(--accent)";
    b.style.color = "#fff";
    setTimeout(function () {
      b.style.background = "var(--surface2)";
      b.style.color = "var(--accent)";
    }, 300);
  });
}

// ==================== FOLDER TREE TOGGLE (RECURSIVE) ====================
// Keeps track of driveId for the currently open modal
var _currentDetailDriveId = null;

function toggleFolderTree(fid, folderPath) {
  // folderPath is the relative path from drive root (e.g. "1- Software" or "1- Software\\Drivers")
  var children = document.getElementById(fid + "_children");
  var arrow = document.getElementById(fid + "_arrow");
  if (!children || !arrow) return;

  // If already open, close it
  if (children.style.display === "block") {
    children.style.display = "none";
    arrow.innerHTML = '<i class="fas fa-chevron-left"></i>';
    return;
  }

  // Open it
  children.style.display = "block";
  arrow.innerHTML = '<i class="fas fa-chevron-down"></i>';

  // Load contents if not already loaded
  var content = document.getElementById(fid + "_content");
  var loading = document.getElementById(fid + "_loading");
  if (content && content.dataset.loaded === "1") return;
  if (!content || !loading) return;

  loading.style.display = "block";
  content.innerHTML = "";

  // Get drive id from the badge element or stored reference
  var driveId = _currentDetailDriveId;
  if (!driveId) {
    var badge = document.querySelector(".drive-id-badge");
    driveId = badge ? badge.textContent.trim() : "";
    _currentDetailDriveId = driveId;
  }

  if (!driveId) {
    content.innerHTML = '<span style="color:var(--text2);">خطا: ID هارد پیدا نشد</span>';
    loading.style.display = "none";
    return;
  }

  // Fetch subfolder contents — folderPath can be multi-level
  var url = API + "/drive/" + encodeURIComponent(driveId) + "/folder/" + encodeURIComponent(folderPath);
  fetch(url)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      loading.style.display = "none";
      if (data.error) {
        content.innerHTML = '<span style="color:var(--red);"><i class="fas fa-exclamation-triangle"></i> خطا: ' + esc(data.error) + '</span>';
        return;
      }
      if (!data.files || data.files.length === 0) {
        content.innerHTML = '<span style="color:var(--text2);"><i class="fas fa-folder-open"></i> این پوشه خالیه</span>';
        return;
      }

      // Build recursive tree: if is_dir => another expandable node
      // Sort: directories first, then files
      var sorted = data.files.slice();
      sorted.sort(function (a, b) {
        if (a.is_dir && !b.is_dir) return -1;
        if (!a.is_dir && b.is_dir) return 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });

      var html = "";
      sorted.forEach(function (file, idx) {
        if (file.is_dir) {
          // Expandable folder node
          var childFid = fid + "_" + idx;
          var childPath = folderPath + "\\" + file.name;
          html += '<div class="ft-node ft-sub">';
          html += '<div class="ft-header" onclick="event.stopPropagation();toggleFolderTree(\'' + childFid + '\', \'' + childPath.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + '\')">';
          html += '<span class="ft-arrow" id="' + childFid + '_arrow"><i class="fas fa-chevron-left"></i></span> ';
          html += '<span><i class="fas fa-folder"></i> ' + esc(file.name) + '</span>';
          html += '</div>';
          html += '<div class="ft-children" id="' + childFid + '_children" style="display:none;">';
          html += '<div class="ft-loading" id="' + childFid + '_loading">در حال بارگذاری...</div>';
          html += '<div class="ft-content" id="' + childFid + '_content"></div>';
          html += '</div>';
          html += '</div>';
        } else {
          // Simple file row
          var sizeStr = (file.size_mb || 0) >= 1
            ? (file.size_mb >= 1000 ? (file.size_mb / 1024).toFixed(2) + " GB" : file.size_mb.toFixed(1) + " MB")
            : (file.size_mb * 1024).toFixed(0) + " KB";
          var fileRelPath = folderPath + "\\" + file.name;
          var fileEnc = encodeURIComponent(fileRelPath);
          html += '<div class="ft-node ft-file">';
          html += '<div class="ft-header" style="cursor:default;padding-left:24px;">';
          html += '<span><i class="fas fa-file"></i> ' + esc(file.name) + '</span>';
          html += '<span class="ft-size">' + sizeStr + '</span>';
          html += '<span class="ft-actions">';
          html += '<button class="btn-micro" title="باز کردن فایل" onclick="event.stopPropagation();openFile(\'' + driveId + '\', \'' + fileEnc.replace(/'/g, "\\'") + '\')"><i class="fas fa-external-link-alt"></i> باز کردن</button>';
          html += '<button class="btn-micro" title="نمایش در پوشه" onclick="event.stopPropagation();openFolder(\'' + driveId + '\', \'' + fileEnc.replace(/'/g, "\\'") + '\')"><i class="fas fa-folder-open"></i> پوشه</button>';
          html += '</span>';
          html += '</div>';
          html += '</div>';
        }
      });

      content.innerHTML = html;
      content.dataset.loaded = "1";
    })
    .catch(function (e) {
      loading.style.display = "none";
      content.innerHTML = '<span style="color:var(--red);"><i class="fas fa-exclamation-triangle"></i> خطا در بارگذاری زیرپوشه‌ها</span>';
    });
}

// ==================== OPEN FILE / FOLDER ====================
function openFile(driveId, relPath) {
  // Opens the file with its default program
  var url = API + "/drive/" + encodeURIComponent(driveId) + "/open/" + relPath;
  fetch(url, { method: "GET" })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.error) {
        toast("خطا: " + data.error, "error");
      } else {
        toast("فایل باز شد <i class='fas fa-check-circle'></i>", "success");
      }
    })
    .catch(function (e) {
      toast("نتونستیم فایل رو باز کنیم. مطمئنی درایو وصله؟", "error");
    });
}

function openFolder(driveId, relPath) {
  // Opens the parent folder of the file in Explorer, selecting the file
  var url = API + "/drive/" + encodeURIComponent(driveId) + "/open/" + relPath + "?folder=1";
  fetch(url, { method: "GET" })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.error) {
        toast("خطا: " + data.error, "error");
      } else {
        toast("پوشه در Windows Explorer باز شد <i class='fas fa-check-circle'></i>", "success");
      }
    })
    .catch(function (e) {
      toast("نتونستیم پوشه رو باز کنیم. مطمئنی درایو وصله؟", "error");
    });
}

// ==================== REBUILD INDEX ====================
async function rebuildIndex() {
  var btn = document.getElementById("rebuildBtn");
  if (!btn) return;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> در حال بازسازی ایندکس...';

  try {
    var data = await apiPost("/rebuild-index", {});
    if (data.success) {
      var msg = "<i class='fas fa-check-circle'></i> ایندکس " + data.rebuilt + " هارد بازسازی شد";
      if (data.failed > 0) {
        msg += " (" + data.failed + " هارد آفلاین بود)";
      }
      toast(msg, "success");
    } else {
      toast("<i class='fas fa-times-circle'></i> خطا در بازسازی ایندکس", "error");
    }
  } catch (e) {
    toast("<i class='fas fa-exclamation-triangle'></i> خطا در ارتباط با سرور", "error");
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-sync"></i> بازسازی ایندکس پوشه‌ها';
}

// ==================== RESCAN DRIVE ====================
async function rescanDrive(id) {
  if (!confirm("مطمئنی میخوای این هارد دوباره اسکن بشه؟\n(اسکن عمیق انجام میشه و ممکنه چند دقیقه طول بکشه)")) return;

  // Find the rescan button in the drive card for this id
  var cards = document.querySelectorAll('.drive-card');
  var btn = null;
  cards.forEach(function(card) {
    if (card.dataset.driveId === id) {
      btn = card.querySelector('.btn-icon-rescan');
    }
  });

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';
  }

  try {
    var data = await apiPost("/rescan/" + encodeURIComponent(id), {});
    if (data.success) {
      toast("<i class='fas fa-check-circle'></i> اسکن مجدد با موفقیت انجام شد.\nID جدید: " + (data.new_drive ? data.new_drive.id : ""), "success");
      loadDrives();
      loadStats();
    } else {
      toast("<i class='fas fa-times-circle'></i> " + (data.error || "خطا در اسکن مجدد"), "error");
    }
  } catch (e) {
    toast("<i class='fas fa-exclamation-triangle'></i> خطا در ارتباط با سرور", "error");
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sync"></i>';
  }
}

// ==================== DELETE ====================
async function deleteDrive(id) {
  if (
    !confirm(
      "از حذف این هارد از کاتالوگ مطمئنی؟ (فایل‌های روی هارد پاک نمی‌شن)"
    )
  )
    return;
  try {
    var r = await apiDelete("/drive/" + encodeURIComponent(id));
  } catch (e) {
    toast("خطا در حذف", "error");
    return;
  }
  if (r.success) {
    toast("هارد از کاتالوگ حذف شد", "success");
    loadDrives();
    loadStats();
  } else {
    toast(r.error || "خطا", "error");
  }
}

// ==================== DRAG & DROP — STANDARD HTML5 REORDER ====================
var _dragSrcId = null;

function setupDragDrop() {
  var grid = document.getElementById("cardGrid");
  if (!grid) return;

  grid.removeEventListener("dragstart", onDragStart);
  grid.removeEventListener("dragover", onDragOver);
  grid.removeEventListener("dragleave", onDragLeave);
  grid.removeEventListener("dragend", onDragEnd);
  grid.removeEventListener("drop", onDrop);

  grid.addEventListener("dragstart", onDragStart, false);
  grid.addEventListener("dragover", onDragOver, false);
  grid.addEventListener("dragleave", onDragLeave, false);
  grid.addEventListener("dragend", onDragEnd, false);
  grid.addEventListener("drop", onDrop, false);
}

function findCard(el) {
  while (el && !el.classList.contains("drive-card") && el.id !== "cardGrid") {
    el = el.parentElement;
  }
  if (el && el.classList.contains("drive-card")) return el;
  return null;
}

function onDragStart(e) {
  var card = findCard(e.target);
  if (!card) return;

  _dragSrcId = card.dataset.driveId;

  // Set drag data
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", _dragSrcId);

  // Delay adding dragging class so the browser captures the non-dragging appearance
  requestAnimationFrame(function () {
    card.classList.add("dragging");
  });

  // Set a semi-transparent drag image (the card itself, slightly scaled)
  if (e.dataTransfer.setDragImage) {
    var rect = card.getBoundingClientRect();
    var ghost = card.cloneNode(true);
    ghost.style.position = "fixed";
    ghost.style.top = "-1000px";
    ghost.style.left = "-1000px";
    ghost.style.width = rect.width + "px";
    ghost.style.opacity = "0.6";
    ghost.style.transform = "scale(0.95)";
    ghost.style.pointerEvents = "none";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, rect.width / 2, rect.height / 2);
    requestAnimationFrame(function () {
      document.body.removeChild(ghost);
    });
  }
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";

  var grid = document.getElementById("cardGrid");
  if (!grid || !_dragSrcId) return;

  grid.classList.add("drop-active");

  // Clear all indicators
  var allCards = Array.from(grid.querySelectorAll(".drive-card"));
  allCards.forEach(function (c) {
    c.classList.remove("drop-before", "drop-after");
  });

  // Find the card we're hovering over
  var targetCard = findCard(e.target);
  if (!targetCard || targetCard.dataset.driveId === _dragSrcId) return;

  // Determine if we should drop before or after this card
  var rect = targetCard.getBoundingClientRect();
  var midY = rect.top + rect.height / 2;

  if (e.clientY < midY) {
    targetCard.classList.add("drop-before");
  } else {
    targetCard.classList.add("drop-after");
  }
}

function onDragLeave(e) {
  // Only clear when leaving the grid, not individual cards
  var grid = document.getElementById("cardGrid");
  if (!grid) return;

  // Check if we actually left the grid (not just moved to a child)
  var related = e.relatedTarget;
  if (!related || !grid.contains(related)) {
    grid.classList.remove("drop-active");
    grid.querySelectorAll(".drive-card").forEach(function (c) {
      c.classList.remove("drop-before", "drop-after");
    });
  }
}

function onDragEnd(e) {
  cleanupDrag();
}

function onDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  var grid = document.getElementById("cardGrid");
  if (!grid || !_dragSrcId) {
    cleanupDrag();
    return;
  }

  var srcCard = grid.querySelector('.drive-card[data-drive-id="' + _dragSrcId + '"]');
  if (!srcCard) {
    cleanupDrag();
    return;
  }

  // Find the drop indicator
  var indicatorCard = grid.querySelector(".drive-card.drop-before, .drive-card.drop-after");
  if (!indicatorCard || indicatorCard === srcCard) {
    cleanupDrag();
    return;
  }

  if (indicatorCard.classList.contains("drop-before")) {
    grid.insertBefore(srcCard, indicatorCard);
  } else {
    // Insert after the indicator card
    var nextSibling = indicatorCard.nextElementSibling;
    if (nextSibling && nextSibling.classList.contains("drive-card")) {
      grid.insertBefore(srcCard, nextSibling);
    } else {
      grid.appendChild(srcCard);
    }
  }

  // Save the new order
  saveDriveOrder();
  cleanupDrag();
}

function cleanupDrag() {
  var grid = document.getElementById("cardGrid");
  if (grid) {
    grid.classList.remove("drop-active");
    grid.querySelectorAll(".drive-card").forEach(function (c) {
      c.classList.remove("dragging", "drop-before", "drop-after");
    });
  }
  _dragSrcId = null;
}

function getDriveOrder() {
  try {
    var order = localStorage.getItem("_archive_drive_order");
    return order ? JSON.parse(order) : null;
  } catch (e) {
    return null;
  }
}

function saveDriveOrder() {
  var grid = document.getElementById("cardGrid");
  if (!grid) return;
  var ids = [];
  grid.querySelectorAll(".drive-card").forEach(function (card) {
    if (card.dataset.driveId) {
      ids.push(card.dataset.driveId);
    }
  });
  try {
    localStorage.setItem("_archive_drive_order", JSON.stringify(ids));
  } catch (e) {
    // localStorage may be full or unavailable
  }
}