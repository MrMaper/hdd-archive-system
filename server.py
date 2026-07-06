#!/usr/bin/env python3
"""
HDD Archive System - HTTP Server
Runs a local web server for managing HDD archives.
Usage: python server.py [--port PORT]
"""

import http.server
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import urllib.parse
import webbrowser
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from socketserver import ThreadingMixIn


class ThreadingHTTPServer(ThreadingMixIn, http.server.HTTPServer):
    """Handle each request in a separate thread, non-blocking."""
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 128

# Global thread pool for background tasks (scanning, etc.)
THREAD_POOL = ThreadPoolExecutor(max_workers=8)

# ─── CONFIG ────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CATALOG_FILE = os.path.join(SCRIPT_DIR, "catalog.json")
LABELS_DIR = os.path.join(SCRIPT_DIR, "labels")
FILE_INDEX_DIR = os.path.join(SCRIPT_DIR, "file_index")
FOLDER_INDEX_DIR = os.path.join(SCRIPT_DIR, "folder_index")
UI_FILE = os.path.join(SCRIPT_DIR, "static", "index.html")
STATIC_DIR = os.path.join(SCRIPT_DIR, "static")
DEFAULT_PORT = 8765

# ─── JALALI (SHAMSI) DATE ──────────────────────────────────
def to_jalali(g_date=None):
    """Convert Gregorian date to Jalali (Shamsi) date dict."""
    if g_date is None:
        g_date = datetime.now()
    g_year, g_month, g_day = g_date.year, g_date.month, g_date.day

    g_days_in_month = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    j_days_in_month = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29]

    def is_gregorian_leap(year):
        return (year % 4 == 0 and year % 100 != 0) or (year % 400 == 0)

    gy = g_year - 1600
    gm = g_month - 1
    gd = g_day - 1

    g_day_no = 365 * gy + (gy + 3) // 4 - (gy + 99) // 100 + (gy + 399) // 400
    for i in range(gm):
        g_day_no += g_days_in_month[i]
    if gm > 1 and is_gregorian_leap(g_year):
        g_day_no += 1
    g_day_no += gd

    j_day_no = g_day_no - 79
    j_np = j_day_no // 12053
    j_day_no = j_day_no % 12053
    jy = 979 + 33 * j_np + 4 * (j_day_no // 1461)
    j_day_no = j_day_no % 1461

    if j_day_no >= 366:
        jy += (j_day_no - 1) // 365
        j_day_no = (j_day_no - 1) % 365

    persian_months = [
        "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
        "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"
    ]

    jm = 0
    jd = 0
    for k in range(12):
        if j_day_no < j_days_in_month[k]:
            jm = k + 1
            jd = j_day_no + 1
            break
        j_day_no -= j_days_in_month[k]

    return {
        "year": jy,
        "month": jm,
        "day": jd,
        "monthStr": persian_months[jm - 1],
        "full": f"{jd} {persian_months[jm - 1]} {jy}",
        "numeric": f"{jy}/{jm:02d}/{jd:02d}",
        "compact": f"{jy}{jm:02d}{jd:02d}"
    }


def to_jalali_compact(g_date=None):
    """Return compact Jalali date as 6-digit string e.g. '14050414'."""
    j = to_jalali(g_date)
    return j["compact"]


def generate_drive_id(catalog):
    """Generate a new drive ID in format: HDD-{num:03d}-{jalali6}
    e.g. HDD-001-14050414, HDD-002-14050120, ...
    Scans existing IDs to find the highest number, then increments.
    """
    max_num = 0
    for drive in catalog.get("drives", []):
        did = drive.get("id", "")
        # Match existing pattern: HDD-NNN-YYYYMMDD
        m = re.match(r"^HDD-(\d{3})-\d{8}$", did)
        if m:
            n = int(m.group(1))
            if n > max_num:
                max_num = n
    next_num = max_num + 1
    jalali = to_jalali_compact()
    return f"HDD-{next_num:03d}-{jalali}"


# ─── CATALOG HELPERS ───────────────────────────────────────
def read_catalog():
    """Read catalog.json, return default if missing."""
    if os.path.exists(CATALOG_FILE):
        try:
            with open(CATALOG_FILE, "r", encoding="utf-8-sig") as f:
                return json.load(f)
        except (json.JSONDecodeError, ValueError):
            print(f"[WARN] catalog.json is corrupted, starting fresh.")
            return {"version": "1.0", "created": datetime.now().strftime("%Y-%m-%d"), "drives": [], "stats": {"total_drives": 0, "total_size_gb": 0, "total_files": 0}}
    return {
        "version": "1.0",
        "created": datetime.now().strftime("%Y-%m-%d"),
        "drives": [],
        "stats": {"total_drives": 0, "total_size_gb": 0, "total_files": 0}
    }


def write_catalog(catalog):
    """Save catalog.json with proper UTF-8 (no ASCII escaping)."""
    with open(CATALOG_FILE, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)


def read_file_index(drive_id):
    """Read file index for a drive, return list of file paths."""
    idx_path = os.path.join(FILE_INDEX_DIR, f"{drive_id}.json")
    if os.path.exists(idx_path):
        try:
            with open(idx_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, ValueError):
            return []
    return []


def write_file_index(drive_id, file_list):
    """Write file index JSON for a drive."""
    os.makedirs(FILE_INDEX_DIR, exist_ok=True)
    idx_path = os.path.join(FILE_INDEX_DIR, f"{drive_id}.json")
    with open(idx_path, "w", encoding="utf-8") as f:
        json.dump(file_list, f, ensure_ascii=False)


def delete_file_index(drive_id):
    """Remove file index for a drive."""
    idx_path = os.path.join(FILE_INDEX_DIR, f"{drive_id}.json")
    if os.path.exists(idx_path):
        os.remove(idx_path)


def read_folder_index(drive_id):
    """Read folder index for a drive, return list of folder names (relative paths)."""
    idx_path = os.path.join(FOLDER_INDEX_DIR, f"{drive_id}.json")
    if os.path.exists(idx_path):
        try:
            with open(idx_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, ValueError):
            return []
    return []


def write_folder_index(drive_id, folder_list):
    """Write folder index JSON for a drive (list of relative folder paths)."""
    os.makedirs(FOLDER_INDEX_DIR, exist_ok=True)
    idx_path = os.path.join(FOLDER_INDEX_DIR, f"{drive_id}.json")
    with open(idx_path, "w", encoding="utf-8") as f:
        json.dump(folder_list, f, ensure_ascii=False)


def delete_folder_index(drive_id):
    """Remove folder index for a drive."""
    idx_path = os.path.join(FOLDER_INDEX_DIR, f"{drive_id}.json")
    if os.path.exists(idx_path):
        os.remove(idx_path)


# ─── SCAN DRIVE ────────────────────────────────────────────
def scan_drive(drive_path, title, physical_mark="", quick=False):
    """Scan a drive and add it to the catalog.
    quick=True -> surface scan only (no recursive walk), very fast."""
    if not drive_path.endswith("\\"):
        drive_path += "\\"

    if not os.path.exists(drive_path):
        return {"success": False, "error": f"Drive not found: {drive_path}"}

    # Get drive info via shutil (reliable, no PowerShell dependency)
    total_size_gb = 0
    free_space_gb = 0
    used_space_gb = 0
    volume_name = ""
    try:
        usage = shutil.disk_usage(drive_path)
        total_size_gb = round(usage.total / (1024 ** 3), 2)
        free_space_gb = round(usage.free / (1024 ** 3), 2)
        used_space_gb = round(usage.used / (1024 ** 3), 2)
    except Exception:
        pass
    # Try getting volume name via PowerShell (optional, non-critical)
    try:
        drive_letter = drive_path.rstrip("\\")
        cmd = (
            f'powershell -NoProfile -Command '
            f'"(Get-Volume -DriveLetter {drive_letter[0]}).FileSystemLabel"'
        )
        result = subprocess.run(cmd, capture_output=True, text=True, shell=True, timeout=10)
        if result.returncode == 0 and result.stdout.strip():
            volume_name = result.stdout.strip()
    except Exception:
        pass

    # Generate new drive ID (before scanning so we have the catalog)
    catalog = read_catalog()
    drive_id = generate_drive_id(catalog)
    
    # Scan folders
    skip_dirs = {"$RECYCLE.BIN", "System Volume Information", "RECYCLER"}

    contents = []
    total_files = 0
    total_size = 0
    file_index = []  # list of relative file paths (relative to drive root)

    try:
        for entry in os.scandir(drive_path):
            if not entry.is_dir():
                continue
            if entry.name in skip_dirs:
                continue

            file_count = 0
            folder_size = 0
            last_modified = ""

            if quick:
                # QUICK SCAN: only count files in the top-level of each folder (no recursion)
                try:
                    for sub in os.scandir(entry.path):
                        if sub.is_file():
                            try:
                                fsize = os.path.getsize(sub.path)
                                folder_size += fsize
                                file_count += 1
                                # Store relative path for quick scan too
                                rel = os.path.join(entry.name, sub.name)
                                file_index.append(rel)
                            except OSError:
                                pass
                except OSError:
                    pass
            else:
                # DEEP SCAN: full recursive walk
                try:
                    for root, dirs, files in os.walk(entry.path):
                        # Compute relative path from drive root
                        rel_dir = os.path.relpath(root, drive_path)
                        for fname in files:
                            fpath = os.path.join(root, fname)
                            try:
                                fsize = os.path.getsize(fpath)
                                folder_size += fsize
                                file_count += 1
                                # Store relative path
                                rel = os.path.join(rel_dir, fname)
                                file_index.append(rel)
                            except OSError:
                                pass
                except OSError:
                    pass

            last_modified_ts = os.path.getmtime(entry.path) if os.path.exists(entry.path) else 0
            last_modified = datetime.fromtimestamp(last_modified_ts).strftime("%Y-%m-%d")

            folder_size_gb = round(folder_size / (1024 ** 3), 2)
            total_files += file_count
            total_size += folder_size

            contents.append({
                "name": entry.name,
                "type": "folder",
                "size_gb": folder_size_gb,
                "file_count": file_count,
                "last_modified": last_modified
            })

    except OSError:
        pass

    total_size_gb_drive = round(total_size / (1024 ** 3), 2)

    # Build new drive entry
    new_drive = {
        "id": drive_id,
        "title": title,
        "physical_mark": physical_mark,
        "date_added": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "volume_name": volume_name,
        "path": drive_path,
        "capacity_gb": total_size_gb if total_size_gb > 0 else total_size_gb_drive,
        "free_space_gb": free_space_gb,
        "used_space_gb": used_space_gb if used_space_gb > 0 else total_size_gb_drive,
        "total_files": total_files,
        "scan_type": "quick" if quick else "deep",
        "contents": contents
    }

    # Save to catalog
    catalog = read_catalog()
    catalog["drives"].append(new_drive)

    # Recalculate stats
    all_drives = catalog["drives"]
    catalog["stats"]["total_drives"] = len(all_drives)
    catalog["stats"]["total_size_gb"] = round(sum(d.get("capacity_gb", 0) for d in all_drives), 2)
    catalog["stats"]["total_files"] = sum(d.get("total_files", 0) for d in all_drives)

    write_catalog(catalog)

    # Save file index
    write_file_index(drive_id, file_index)

    # Save folder index (all subfolder paths relative to drive root)
    folder_index = []
    for root, dirs, files in os.walk(drive_path):
        for dname in dirs:
            full = os.path.join(root, dname)
            # Skip hidden/system dirs
            if dname in skip_dirs or dname.startswith("$"):
                continue
            rel = os.path.relpath(full, drive_path)
            folder_index.append(rel)
    write_folder_index(drive_id, folder_index)

    # Generate label file
    os.makedirs(LABELS_DIR, exist_ok=True)
    label_file = os.path.join(LABELS_DIR, f"{drive_id}.txt")
    jalali = to_jalali()
    label_lines = [
        "=" * 40,
        f"  LABEL INFO - {drive_id}",
        "=" * 40,
        "",
        f"  Title: {title}",
        f"  Physical: {physical_mark}",
        f"  Date: {jalali['numeric']}",
        f"  Capacity: {used_space_gb}GB / {total_size_gb}GB",
        f"  Files: {total_files} files in {len(contents)} folders",
        "",
        "  CONTENTS:"
    ]
    for c in contents:
        label_lines.append(f"    [{c['size_gb']}GB] {c['name']} ({c['file_count']} files)")
    label_lines.append("=" * 40)

    with open(label_file, "w", encoding="utf-8") as f:
        f.write("\n".join(label_lines))

    return {"success": True, "drive": new_drive, "labelFile": label_file}


# ─── SEARCH ────────────────────────────────────────────────
def search_all(query):
    """
    Search across ALL indexed data:
    1. Drive titles & physical marks
    2. Folder names in catalog
    3. File names in file_index (if available)
    Returns unified results grouped by drive.
    """
    catalog = read_catalog()
    q = query.lower().strip()
    if not q:
        return {"query": query, "results": [], "count": 0, "file_matches": 0}

    results_map = {}  # drive_id -> result entry

    for drive in catalog.get("drives", []):
        drive_id = drive.get("id", "")
        drive_title = drive.get("title", "")
        drive_mark = drive.get("physical_mark", "")
        drive_date = drive.get("date_added", "")
        drive_path = drive.get("path", "")
        drive_used = drive.get("used_space_gb", 0)
        drive_cap = drive.get("capacity_gb", 0)
        drive_total_files = drive.get("total_files", 0)
        drive_scan = drive.get("scan_type", "")

        # Check title match
        title_hit = q in drive_title.lower()
        # Check physical mark match
        mark_hit = q in drive_mark.lower()
        # Check volume name match
        vol_hit = q in drive.get("volume_name", "").lower()
        # Check drive ID match (e.g. HDD-001-14050415)
        id_hit = q in drive_id.lower()
        # Check folder name matches (from folder_index for ALL levels, fallback to contents)
        folder_index = read_folder_index(drive_id)
        folder_hits = []
        seen_folders = set()

        # Aggregate folder stats from file_index using NORMALIZED forward‑slash paths
        folder_stats = {}  # {normalized_folder_path: {"size": bytes, "count": int}}
        file_index = read_file_index(drive_id)
        for rel_path in file_index:
            norm = rel_path.replace("\\", "/")
            parent = os.path.dirname(norm)  # dirname works fine with / on Windows
            folder_stats.setdefault(parent, {"size": 0, "count": 0})
            folder_stats[parent]["count"] += 1
        # Merge in real size_gb from drive.contents (top‑level folders only)
        for entry in drive.get("contents", []):
            ename = entry.get("name", "").replace("\\", "/")
            estats = folder_stats.setdefault(ename, {"size": 0, "count": 0})
            estats["size"] = entry.get("size_gb", 0) * (1024**3)
            estats["count"] = entry.get("file_count", estats["count"])

        if folder_index:
            # Normalize folder_index paths: replace \ → /
            norm_folder_index = [fp.replace("\\", "/") for fp in folder_index]
            # Search in folder_index (all subfolder levels)
            for fpath in norm_folder_index:
                # Match against any part of the folder path
                parts = fpath.split("/")
                for part in parts:
                    if q in part.lower():
                        if fpath not in seen_folders:
                            seen_folders.add(fpath)
                            # Aggregate stats for this folder and its subfolders
                            total_size = 0
                            total_count = 0
                            prefix = fpath + "/"
                            for fp_stat, stats in folder_stats.items():
                                # fp_stat (from folder_stats) is already normalized (/)
                                if fp_stat == fpath or fp_stat.startswith(prefix):
                                    total_size += stats["size"]
                                    total_count += stats["count"]
                            size_gb = round(total_size / (1024**3), 2) if total_size > 0 else 0
                            folder_hits.append({
                                "name": fpath,  # full relative path
                                "size_gb": size_gb,
                                "file_count": total_count
                            })
                        break
        else:
            # Fallback to contents (level 1 only)
            for f in drive.get("contents", []):
                fname = f.get("name", "")
                if q in fname.lower():
                    folder_hits.append({
                        "name": fname,
                        "size_gb": f.get("size_gb", 0),
                        "file_count": f.get("file_count", 0)
                    })

        # Check file index matches
        file_index = read_file_index(drive_id)
        file_hits = []
        for rel_path in file_index:
            fname = os.path.basename(rel_path)
            if q in fname.lower():
                # Also check if the parent folder name contains the query
                parent = os.path.dirname(rel_path)
                file_hits.append({
                    "name": fname,
                    "path": rel_path,
                    "folder": parent
                })
        # Also search in folder part of path
        for rel_path in file_index:
            parts = rel_path.replace("\\", "/").split("/")
            # Check each path segment
            for part in parts[:-1]:  # exclude filename itself
                if q in part.lower():
                    fname = os.path.basename(rel_path)
                    parent = os.path.dirname(rel_path)
                    # Avoid duplicates
                    already = any(h["path"] == rel_path for h in file_hits)
                    if not already:
                        file_hits.append({
                            "name": fname,
                            "path": rel_path,
                            "folder": parent
                        })
                    break

        # If anything matched, add to results
        has_match = title_hit or mark_hit or vol_hit or id_hit or len(folder_hits) > 0 or len(file_hits) > 0

        if has_match:
            results_map[drive_id] = {
                "drive_id": drive_id,
                "title": drive_title,
                "physical_mark": drive_mark,
                "date_added": drive_date,
                "path": drive_path,
                "used_space_gb": drive_used,
                "capacity_gb": drive_cap,
                "total_files": drive_total_files,
                "scan_type": drive_scan,
                "volume_name": drive.get("volume_name", ""),
                "title_hit": title_hit,
                "mark_hit": mark_hit,
                "vol_hit": vol_hit,
                "folder_matches": folder_hits,
                "file_matches": file_hits,
                "match_count": (1 if title_hit else 0) + (1 if mark_hit else 0) + (1 if vol_hit else 0) + (1 if id_hit else 0) + len(folder_hits) + len(file_hits)
            }

    # Sort results by match_count descending
    results = sorted(results_map.values(), key=lambda x: x["match_count"], reverse=True)

    total_file_matches = sum(len(r["file_matches"]) for r in results)

    return {
        "query": query,
        "results": results,
        "count": len(results),
        "file_matches": total_file_matches
    }


# ─── HTTP REQUEST HANDLER ──────────────────────────────────
class ArchiveHandler(http.server.BaseHTTPRequestHandler):
    """Handles all HTTP requests for the archive system."""

    # Silence default logging per request
    def log_message(self, format, *args):
        pass

    def _send_json(self, data, status=200):
        """Send JSON response with proper UTF-8."""
        try:
            body = json.dumps(data, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS, DELETE")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(body)
            self.wfile.flush()
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError, OSError):
            pass

    def _send_html(self, content, status=200):
        """Send HTML response."""
        try:
            body = content.encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(body)
            self.wfile.flush()
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError, OSError):
            pass

    def _read_body(self):
        """Read request body."""
        length = int(self.headers.get("Content-Length", 0))
        if length > 0:
            return self.rfile.read(length).decode("utf-8")
        return ""

    def _parse_query(self):
        """Parse URL query string into dict."""
        parsed = urllib.parse.urlparse(self.path)
        return dict(urllib.parse.parse_qsl(parsed.query))

    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS, DELETE")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        """Route GET requests."""
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = dict(urllib.parse.parse_qsl(parsed.query))

        try:
            # Serve static files (CSS, JS, images, etc.)
            if path.startswith("/static/"):
                file_path = os.path.join(SCRIPT_DIR, path.lstrip("/"))
                file_path = os.path.normpath(file_path)
                # Security: prevent path traversal
                if not file_path.startswith(os.path.normpath(STATIC_DIR)):
                    self._send_json({"error": "Forbidden"}, 403)
                    return
                if os.path.isfile(file_path):
                    ext = os.path.splitext(file_path)[1].lower()
                    mime = {
                        ".css": "text/css",
                        ".js": "application/javascript",
                        ".html": "text/html",
                        ".json": "application/json",
                        ".png": "image/png",
                        ".jpg": "image/jpeg",
                        ".jpeg": "image/jpeg",
                        ".gif": "image/gif",
                        ".svg": "image/svg+xml",
                        ".ico": "image/x-icon",
                        ".woff": "font/woff",
                        ".woff2": "font/woff2",
                    }.get(ext, "application/octet-stream")
                    with open(file_path, "rb") as f:
                        content = f.read()
                    self.send_response(200)
                    self.send_header("Content-Type", mime)
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Content-Length", str(len(content)))
                    self.send_header("Connection", "close")
                    self.end_headers()
                    self.wfile.write(content)
                    self.wfile.flush()
                else:
                    self._send_json({"error": "File not found"}, 404)
                return

            # Serve UI
            if path == "/" or path == "/index.html":
                if os.path.exists(UI_FILE):
                    with open(UI_FILE, "r", encoding="utf-8") as f:
                        self._send_html(f.read())
                else:
                    self._send_json({"error": "UI file not found"}, 404)
                return

            # API: List all drives (summary — no heavy contents array)
            if path == "/api/drives":
                catalog = read_catalog()
                summary_drives = []
                for d in catalog.get("drives", []):
                    sd = {
                        "id": d.get("id"),
                        "title": d.get("title"),
                        "physical_mark": d.get("physical_mark", ""),
                        "date_added": d.get("date_added", ""),
                        "volume_name": d.get("volume_name", ""),
                        "path": d.get("path", ""),
                        "capacity_gb": d.get("capacity_gb", 0),
                        "free_space_gb": d.get("free_space_gb", 0),
                        "used_space_gb": d.get("used_space_gb", 0),
                        "total_files": d.get("total_files", 0),
                        "scan_type": d.get("scan_type", ""),
                        "folder_count": len(d.get("contents", [])),
                        "folders": [c.get("name") for c in d.get("contents", [])],
                    }
                    summary_drives.append(sd)
                self._send_json({
                    "stats": catalog.get("stats", {}),
                    "drives": summary_drives,
                })
                return

            # API: Get folder contents (sub-folder listing) — MUST be checked BEFORE plain drive
            folder_match = re.match(r"^/api/drive/(.+)/folder/(.+)$", path)
            if folder_match:
                drive_id = urllib.parse.unquote(folder_match.group(1))
                folder_name = urllib.parse.unquote(folder_match.group(2))
                # Normalize path separators (accept both / and \) and prevent path traversal
                folder_name = folder_name.replace("/", "\\")
                # Remove leading backslash if present
                folder_name = folder_name.lstrip("\\")
                catalog = read_catalog()
                for drive in catalog["drives"]:
                    if drive["id"] == drive_id:
                        drive_path = drive.get("path", "")
                        target = os.path.join(drive_path, folder_name)
                        # Security: ensure target is inside drive_path
                        target_norm = os.path.normpath(target)
                        drive_norm = os.path.normpath(drive_path.rstrip("\\"))
                        if not target_norm.startswith(drive_norm) and target_norm != drive_norm:
                            self._send_json({"error": "Access denied"}, 403)
                            return
                        if not os.path.isdir(target):
                            self._send_json({"error": f"Folder not found: {folder_name}"}, 404)
                            return
                        files = []
                        try:
                            for item in sorted(os.listdir(target)):
                                item_path = os.path.join(target, item)
                                is_dir = os.path.isdir(item_path)
                                size_mb = 0
                                try:
                                    size_mb = round(os.path.getsize(item_path) / (1024 * 1024), 2) if not is_dir else 0
                                except OSError:
                                    pass
                                files.append({
                                    "name": item,
                                    "is_dir": is_dir,
                                    "size_mb": size_mb,
                                })
                        except OSError as e:
                            self._send_json({"error": str(e)}, 500)
                            return
                        self._send_json({"drive_id": drive_id, "folder": folder_name, "files": files})
                        return
                self._send_json({"error": "Drive not found"}, 404)
                return

            # API: Open file or folder on the drive
            open_match = re.match(r"^/api/drive/(.+)/open/(.+)$", path)
            if open_match:
                drive_id = urllib.parse.unquote(open_match.group(1))
                rel_path = urllib.parse.unquote(open_match.group(2))
                rel_path = rel_path.replace("/", "\\").lstrip("\\")
                open_folder_mode = query.get("folder", "0") == "1"
                catalog = read_catalog()
                for drive in catalog["drives"]:
                    if drive["id"] == drive_id:
                        drive_path = drive.get("path", "")
                        target = os.path.join(drive_path, rel_path)
                        target_norm = os.path.normpath(target)
                        drive_norm = os.path.normpath(drive_path.rstrip("\\"))
                        if not target_norm.startswith(drive_norm) and target_norm != drive_norm:
                            self._send_json({"error": "Access denied"}, 403)
                            return
                        if not os.path.exists(target):
                            self._send_json({"error": f"Path not found: {rel_path}"}, 404)
                            return
                        try:
                            if os.path.isdir(target):
                                # Open folder in Explorer
                                os.startfile(os.path.normpath(target))
                            elif open_folder_mode:
                                # Open parent folder and select the file
                                subprocess.Popen(["explorer", "/select,", os.path.normpath(target)])
                            else:
                                # Open file with its default program
                                os.startfile(os.path.normpath(target))
                            self._send_json({"success": True, "path": target, "is_dir": os.path.isdir(target)})
                        except Exception as e:
                            self._send_json({"error": f"Could not open: {e}"}, 500)
                        return
                self._send_json({"error": "Drive not found"}, 404)
                return

            # API: Get drive by ID (only if NOT a folder request)
            drive_match = re.match(r"^/api/drive/(.+)$", path)
            if drive_match:
                drive_id = urllib.parse.unquote(drive_match.group(1))
                catalog = read_catalog()
                for drive in catalog["drives"]:
                    if drive["id"] == drive_id:
                        self._send_json(drive)
                        return
                self._send_json({"error": "Drive not found"}, 404)
                return

            # API: Search
            if path == "/api/search":
                q = query.get("q", "")
                if not q:
                    self._send_json({"error": "Missing query parameter q"}, 400)
                    return
                result = search_all(q)
                self._send_json(result)
                return

            # API: Get label
            label_match = re.match(r"^/api/label/(.+)$", path)
            if label_match:
                drive_id = label_match.group(1)
                simple = query.get("simple", "false") == "true"

                # Try to generate from catalog data for fresh labels
                catalog = read_catalog()
                drive_data = None
                for d in catalog.get("drives", []):
                    if d["id"] == drive_id:
                        drive_data = d
                        break

                if not drive_data:
                    # Fall back to saved label file
                    label_file = os.path.join(LABELS_DIR, f"{drive_id}.txt")
                    if os.path.exists(label_file):
                        with open(label_file, "r", encoding="utf-8") as f:
                            label = f.read()
                        self._send_json({"id": drive_id, "label": label})
                    else:
                        self._send_json({"error": "Label not found"}, 404)
                    return

                jalali = to_jalali()
                title = drive_data.get("title", "")
                physical = drive_data.get("physical_mark", "")
                vol_name = drive_data.get("volume_name", "")
                used = drive_data.get("used_space_gb", 0)
                cap = drive_data.get("capacity_gb", 0)
                total_files = drive_data.get("total_files", 0)
                contents = drive_data.get("contents", [])

                if simple:
                    # Simple label: upper section only, no CONTENTS
                    label_lines = [
                        "=" * 40,
                        f"  LABEL INFO - {drive_id}",
                        "=" * 40,
                        "",
                        f"  Title: {title}",
                        f"  Volume: {vol_name}",
                        f"  Physical: {physical}",
                        f"  Date: {jalali['numeric']}",
                        f"  Capacity: {used}GB / {cap}GB",
                        f"  Files: {total_files} files in {len(contents)} folders",
                        "=" * 40,
                    ]
                else:
                    # Full label with contents
                    label_lines = [
                        "=" * 40,
                        f"  LABEL INFO - {drive_id}",
                        "=" * 40,
                        "",
                        f"  Title: {title}",
                        f"  Volume: {vol_name}",
                        f"  Physical: {physical}",
                        f"  Date: {jalali['numeric']}",
                        f"  Capacity: {used}GB / {cap}GB",
                        f"  Files: {total_files} files in {len(contents)} folders",
                        "",
                        "  CONTENTS:"
                    ]
                    for c in contents:
                        label_lines.append(f"    [{c['size_gb']}GB] {c['name']} ({c['file_count']} files)")
                    label_lines.append("=" * 40)

                self._send_json({"id": drive_id, "label": "\n".join(label_lines)})
                return

            # API: Stats
            if path == "/api/stats":
                catalog = read_catalog()
                self._send_json(catalog["stats"])
                return

            # API: Online drives
            if path == "/api/drives-online":
                try:
                    import ctypes
                    import ctypes.wintypes

                    kernel32 = ctypes.windll.kernel32
                    DRIVE_FIXED = 3
                    DRIVE_REMOVABLE = 2

                    drives_list = []
                    for d in range(65, 91):  # A-Z
                        d_letter = chr(d)
                        d_path = d_letter + ":\\"

                        # Only check physical drives (skip CD-ROM, network, RAM disks)
                        drive_type = kernel32.GetDriveTypeW(d_path)
                        if drive_type not in (DRIVE_FIXED, DRIVE_REMOVABLE):
                            continue
                        if not os.path.exists(d_path):
                            continue

                        # Get volume label via ctypes
                        label = ""
                        try:
                            buf = ctypes.create_unicode_buffer(256)
                            kernel32.GetVolumeInformationW(
                                d_path, buf, 256, None, None, None, None, 0
                            )
                            label = buf.value or ""
                        except Exception:
                            pass

                        # Get disk usage
                        total_gb = 0.0
                        free_gb = 0.0
                        used_gb = 0.0
                        try:
                            usage = shutil.disk_usage(d_path)
                            total_gb = round(usage.total / (1024 ** 3), 2)
                            free_gb = round(usage.free / (1024 ** 3), 2)
                            used_gb = round(usage.used / (1024 ** 3), 2)
                        except Exception:
                            pass

                        drives_list.append({
                            "letter": d_path.rstrip("\\"),
                            "label": label,
                            "total_gb": total_gb,
                            "free_gb": free_gb,
                            "used_gb": used_gb,
                        })
                    self._send_json(drives_list)
                except Exception as e:
                    self._send_json({"error": str(e)}, 500)
                return

            # 404
            self._send_json({"error": "Not found"}, 404)

        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass
        except Exception as e:
            print(f"[ERROR] GET {self.path}: {e}")
            try:
                self._send_json({"error": str(e)}, 500)
            except Exception:
                pass

    def do_POST(self):
        """Route POST requests."""
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        try:
            # API: Scan drive (run in background thread so UI stays responsive)
            if path == "/api/scan":
                body = self._read_body()
                data = json.loads(body)

                drive_path = data.get("drivePath", "")
                title = data.get("title", "")
                physical_mark = data.get("physicalMark", "")
                quick = data.get("quick", False)

                if not drive_path or not title:
                    self._send_json({"error": "drivePath and title are required"}, 400)
                    return

                mode = "QUICK" if quick else "DEEP"
                print(f"[SCAN] Starting {mode} scan of {drive_path}...")
                # Run scan in thread pool so it doesn't block the HTTP connection
                future = THREAD_POOL.submit(scan_drive, drive_path, title, physical_mark, quick)
                result = future.result(timeout=600)  # Wait up to 10 minutes
                status_str = "Done" if result.get("success") else "Failed"
                print(f"[SCAN] {status_str}: {result.get('drive', {}).get('id', '')}")

                self._send_json(result)
                return

            # API: Rebuild folder index for ALL drives (no re-scan, just walk folders)
            if path == "/api/rebuild-index":
                skip_dirs = {"$RECYCLE.BIN", "System Volume Information", "RECYCLER"}
                catalog = read_catalog()
                rebuilt = 0
                failed = 0

                for drive in catalog.get("drives", []):
                    drive_id = drive.get("id", "")
                    drive_path = drive.get("path", "")
                    if not drive_path or not os.path.exists(drive_path):
                        failed += 1
                        continue

                    # Update the date_added to now (Iran UTC+3:30)
                    now_iso = datetime.now().strftime("%Y-%m-%dT%H:%M:%S+03:30")
                    drive["date_added"] = now_iso

                    # Regenerate label file with new date
                    try:
                        jalali = to_jalali()
                        title = drive.get("title", "")
                        physical = drive.get("physical_mark", "")
                        vol_name = drive.get("volume_name", "")
                        used = drive.get("used_space_gb", 0)
                        cap = drive.get("capacity_gb", 0)
                        total_files = drive.get("total_files", 0)
                        contents = drive.get("contents", [])
                        label_lines = [
                            "=" * 40,
                            f"  LABEL INFO - {drive_id}",
                            "=" * 40,
                            "",
                            f"  Title: {title}",
                            f"  Volume: {vol_name}",
                            f"  Physical: {physical}",
                            f"  Date: {jalali['numeric']}",
                            f"  Capacity: {used}GB / {cap}GB",
                            f"  Files: {total_files} files in {len(contents)} folders",
                            "",
                            "  CONTENTS:"
                        ]
                        for c in contents:
                            label_lines.append(f"    [{c['size_gb']}GB] {c['name']} ({c['file_count']} files)")
                        label_lines.append("=" * 40)
                        label_file = os.path.join(LABELS_DIR, f"{drive_id}.txt")
                        with open(label_file, "w", encoding="utf-8") as f:
                            f.write("\n".join(label_lines))
                    except Exception as e:
                        print(f"[INDEX] Failed to update label for {drive_id}: {e}")

                    folder_index = []
                    try:
                        for root, dirs, _ in os.walk(drive_path):
                            for dname in dirs:
                                full = os.path.join(root, dname)
                                if dname in skip_dirs or dname.startswith("$"):
                                    continue
                                rel = os.path.relpath(full, drive_path)
                                folder_index.append(rel)
                        write_folder_index(drive_id, folder_index)
                        rebuilt += 1
                        print(f"[INDEX] Rebuilt folder index for {drive_id}: {len(folder_index)} folders")
                    except Exception as e:
                        print(f"[INDEX] Failed for {drive_id}: {e}")
                        failed += 1

                # Save updated dates back to catalog
                write_catalog(catalog)

                self._send_json({
                    "success": True,
                    "rebuilt": rebuilt,
                    "failed": failed,
                    "total": rebuilt + failed
                })
                return

            # API: Re-scan a single existing drive (deep scan, replaces old entry)
            rescan_match = re.match(r"^/api/rescan/(.+)$", path)
            if rescan_match:
                drive_id = rescan_match.group(1)
                catalog = read_catalog()

                # Find the drive
                old_drive = None
                for d in catalog.get("drives", []):
                    if d["id"] == drive_id:
                        old_drive = d
                        break

                if not old_drive:
                    self._send_json({"error": "Drive not found"}, 404)
                    return

                drive_path = old_drive.get("path", "")
                title = old_drive.get("title", "")
                physical_mark = old_drive.get("physical_mark", "")

                if not drive_path or not os.path.exists(drive_path):
                    self._send_json({"error": f"Drive path not accessible: {drive_path}"}, 400)
                    return

                # Remove old drive from catalog
                catalog["drives"] = [d for d in catalog["drives"] if d["id"] != drive_id]
                write_catalog(catalog)

                # Run deep scan (which will append a new entry with new ID)
                print(f"[RESCAN] Re-scanning {drive_id} ({title}) at {drive_path}...")
                result = scan_drive(drive_path, title, physical_mark, quick=False)
                status_str = "Done" if result.get("success") else "Failed"
                print(f"[RESCAN] {status_str}: {result.get('drive', {}).get('id', '')}")

                self._send_json({
                    "success": result.get("success", False),
                    "old_id": drive_id,
                    "new_drive": result.get("drive", {}),
                    "error": result.get("error", "")
                })
                return

            # 404
            self._send_json({"error": "Not found"}, 404)

        except json.JSONDecodeError:
            self._send_json({"error": "Invalid JSON"}, 400)
        except Exception as e:
            print(f"[ERROR] {e}")
            self._send_json({"error": str(e)}, 500)

    def do_PUT(self):
        """Route PUT requests."""
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        try:
            drive_match = re.match(r"^/api/drive/(.+)$", path)
            if drive_match:
                drive_id = drive_match.group(1)
                body = self._read_body()
                data = json.loads(body)

                catalog = read_catalog()
                found = False
                for drive in catalog["drives"]:
                    if drive["id"] == drive_id:
                        if "title" in data:
                            drive["title"] = data["title"]
                        if "physical_mark" in data:
                            drive["physical_mark"] = data["physical_mark"]
                        found = True

                        # Update label file too
                        label_file = os.path.join(LABELS_DIR, f"{drive_id}.txt")
                        if os.path.exists(label_file):
                            try:
                                drive_copy = dict(drive)
                                jalali = to_jalali(
                                    datetime.fromisoformat(drive.get("date_added", "").split(".")[0]) if "T" in (drive.get("date_added", "")) else datetime.strptime(drive.get("date_added", ""), "%Y-%m-%d")
                                ) if drive.get("date_added") else to_jalali()
                                lines = [
                                    "=" * 40,
                                    f"  LABEL INFO - {drive_id}",
                                    "=" * 40,
                                    "",
                                    f"  Title: {drive['title']}",
                                    f"  Physical: {drive.get('physical_mark', '')}",
                                    f"  Date: {jalali['numeric']}",
                                    f"  Capacity: {drive.get('used_space_gb', 0)}GB / {drive.get('capacity_gb', 0)}GB",
                                    f"  Files: {drive.get('total_files', 0)} files",
                                    "",
                                    "  CONTENTS:"
                                ]
                                for c in drive.get("contents", []):
                                    lines.append(f"    [{c['size_gb']}GB] {c['name']} ({c['file_count']} files)")
                                lines.append("=" * 40)
                                with open(label_file, "w", encoding="utf-8") as f:
                                    f.write("\n".join(lines))
                            except Exception:
                                pass

                        break

                if found:
                    write_catalog(catalog)
                    self._send_json({"success": True, "drive": {k: v for k, v in catalog["drives"][-1].items()}})
                else:
                    self._send_json({"error": "Drive not found"}, 404)
                return

            self._send_json({"error": "Not found"}, 404)

        except json.JSONDecodeError:
            self._send_json({"error": "Invalid JSON"}, 400)
        except Exception as e:
            print(f"[ERROR] {e}")
            self._send_json({"error": str(e)}, 500)

    def do_DELETE(self):
        """Route DELETE requests."""
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        try:
            # API: Delete drive
            drive_match = re.match(r"^/api/drive/(.+)$", path)
            if drive_match:
                drive_id = drive_match.group(1)
                catalog = read_catalog()
                before = len(catalog["drives"])
                catalog["drives"] = [d for d in catalog["drives"] if d["id"] != drive_id]

                if len(catalog["drives"]) < before:
                    all_drives = catalog["drives"]
                    catalog["stats"]["total_drives"] = len(all_drives)
                    catalog["stats"]["total_size_gb"] = round(
                        sum(d.get("capacity_gb", 0) for d in all_drives), 2
                    )
                    catalog["stats"]["total_files"] = sum(
                        d.get("total_files", 0) for d in all_drives
                    )
                    write_catalog(catalog)

                    # Remove label file
                    label_file = os.path.join(LABELS_DIR, f"{drive_id}.txt")
                    if os.path.exists(label_file):
                        os.remove(label_file)

                    # Remove file index
                    delete_file_index(drive_id)

                    # Remove folder index
                    delete_folder_index(drive_id)

                    self._send_json({"success": True})
                else:
                    self._send_json({"error": "Drive not found"}, 404)
                return

            # 404
            self._send_json({"error": "Not found"}, 404)

        except Exception as e:
            print(f"[ERROR] {e}")
            self._send_json({"error": str(e)}, 500)


# ─── MAIN ──────────────────────────────────────────────────
def main():
    port = DEFAULT_PORT

    # Parse command line arguments
    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--port" or args[i] == "-p":
            if i + 1 < len(args):
                port = int(args[i + 1])
                i += 2
            else:
                i += 1
        elif args[i].startswith("--port="):
            port = int(args[i].split("=", 1)[1])
            i += 1
        else:
            i += 1

    # Ensure labels directory exists
    os.makedirs(LABELS_DIR, exist_ok=True)
    os.makedirs(FILE_INDEX_DIR, exist_ok=True)
    os.makedirs(FOLDER_INDEX_DIR, exist_ok=True)

    server = ThreadingHTTPServer(("localhost", port), ArchiveHandler)

    print("=" * 40)
    print("  HDD Archive System - Web Server (Python)")
    print("=" * 40)
    print()
    print(f"  Server running at:")
    print(f"  http://localhost:{port}")
    print()
    print("  Press Ctrl+C to stop the server")
    print()

    # Open browser after a short delay (wait for server to be ready)
    def _open_browser():
        import time
        time.sleep(1.5)
        try:
            webbrowser.open(f"http://localhost:{port}", new=0, autoraise=True)
        except Exception:
            pass

    threading.Thread(target=_open_browser, daemon=True).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[STOP] Server stopped.")
        server.server_close()
    except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
        print("\n[STOP] Client disconnected unexpectedly. Continuing...")
        server.server_close()
        main()


if __name__ == "__main__":
    main()