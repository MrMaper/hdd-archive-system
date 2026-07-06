// App initialization & tab switching

// ==================== STATS ====================
async function loadStats() {
  try {
    var data = await apiGet("/drives");
    var drives = data.drives || [];
    document.getElementById("driveCount").textContent = drives.length;
    var totalSize = 0;
    var totalFiles = 0;
    drives.forEach(function (d) {
      totalSize += d.used_space_gb || 0;
      totalFiles += d.total_files || 0;
    });
    document.getElementById("totalSize").innerHTML =
      '<span dir="ltr" style="direction:ltr;display:inline-block;font-family:Consolas,monospace">' +
      totalSize.toFixed(0) +
      " GB</span>";
    document.getElementById("totalFiles").textContent =
      totalFiles.toLocaleString();
  } catch (e) {
    // Server offline or error
  }
}

// ==================== TAB SWITCHING ====================
function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll(".tab").forEach(function (t) {
    t.classList.remove("active");
    if (t.getAttribute("data-tab") === tabName) {
      t.classList.add("active");
    }
  });

  // Switch panels
  document.querySelectorAll(".panel").forEach(function (p) {
    p.classList.remove("active");
  });
  var panel = document.getElementById(tabName + "Panel");
  if (panel) {
    panel.classList.add("active");
  }

  // Load data per tab
  if (tabName === "drives") {
    loadDrives();
    loadStats();
  } else if (tabName === "scan") {
    showScanPage();
  } else if (tabName === "search") {
    document.getElementById("searchInput").value = "";
    document.getElementById("searchResults").innerHTML = "";
  }
}

// ==================== INIT ====================
document.addEventListener("DOMContentLoaded", function () {
  switchTab("drives");
  loadStats();

  // Auto-refresh every few mins
  setInterval(function () {
    loadDrives();
    loadStats();
  }, 120000);
});