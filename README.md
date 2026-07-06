# HDD Archive System

A self-hosted web-based system to index, catalog, search, and label external hard drives — built entirely with Python standard library, zero dependencies.

I had a pile of external hard drives lying around with no clue what was on each one. So I built this. It scans a drive, saves metadata (filenames, paths, sizes) into a JSON catalog, and gives you a web UI to search through everything in Persian. It also prints physical labels for each drive so you can stick them on the enclosure and never lose track again.

![Python](https://img.shields.io/badge/Python-3.8%2B-blue?style=flat&logo=python)
![License](https://img.shields.io/badge/License-MIT-green?style=flat)
![Platform](https://img.shields.io/badge/Platform-Windows-lightgrey?style=flat)
![Status](https://img.shields.io/badge/Status-finished-brightgreen?style=flat)

## Features

- **Scan & index** any drive — walks the full directory tree and stores everything in a JSON catalog
- **Persian full-text search** — works with Persian filenames, folder names, and drive titles. Supports common Arabic vs Persian character variations (ي/ی, ك/ک, ة/ه, إ/ا)
- **Label generation** — two formats: a Box-Drawing version for manual editing, and a clean stripped-down version for thermal label printers (with a copy button)
- **Jalali (Shamsi) calendar dates** throughout the UI
- **Threaded HTTP server** — long scans don't block other requests
- **Read-only metadata** — never touches the actual files on the drive
- **Zero dependencies** — only Python stdlib modules. No pip install needed.

## Quick Start

Double-click `run_server.bat`, or run this from the terminal:

```bash
cd _archive_system
python server.py --port 8765
```

Then open `http://localhost:8765` in your browser.

## Prerequisites

- Python 3.8 or newer (must be in your PATH)
- Windows
- No external libraries — everything is built on Python's standard library

## Install (clone from GitHub)

```bash
git clone https://github.com/MrMaper/hdd-archive-system.git
cd hdd-archive-system
python server.py --port 8765
```

That's it. No virtualenv, no pip, no requirements.txt.

## Project Structure

```
_archive_system/
├── server.py             ← Main Python HTTP server (ThreadingHTTPServer)
├── run_server.bat        ← Quick launcher (double-click to run)
├── catalog.json          ← JSON database of all indexed drives
├── labels/               ← Generated label files (*.txt)
│   └── HDD-*.txt
├── static/               ← Web UI files
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── app.js
│       ├── api.js
│       ├── utils.js
│       ├── search.js
│       ├── scan.js
│       ├── drives.js
│       └── label.js
└── README.md
```

## API Endpoints

| Method | Endpoint            | Description                                 |
| ------ | ------------------- | ------------------------------------------- |
| GET    | `/api/drives`       | List all indexed drives                     |
| GET    | `/api/drive/{id}`   | Get details for a specific drive            |
| GET    | `/api/search?q=...` | Search across drive titles and folder names |
| GET    | `/api/label/{id}`   | Get label content for a drive               |
| GET    | `/api/stats`        | Aggregate statistics                        |
| POST   | `/api/scan`         | Start a new drive scan                      |
| DELETE | `/api/drive/{id}`   | Remove a drive from the catalog             |

## Label Format

Each label gets printed and stuck on the physical drive enclosure. Here's what's on it:

| Field         | Example                  |
| ------------- | ------------------------ |
| Drive Code    | HDD-001-14050415         |
| Title         | Python Courses 1404      |
| Physical Mark | Western Digital Blue 2TB |
| Date (Jalali) | 1404/04/15               |
| Capacity      | 450GB / 2TB              |
| Top Folders   | Python, Django, ML       |

## Notes

- **Your actual files are never modified.** Only metadata gets saved to `catalog.json`.
- **Removing a drive from the catalog** doesn't delete anything from the drive itself.
- **Personal data like `catalog.json` and generated labels are gitignored** — they won't be pushed to GitHub.
- The Persian search normalizes variant characters, so typing either "ك" or "ک" will find both.

## Contributing

Pull requests are welcome. If you have an idea, fork the repo and open a PR:

1. Fork the project
2. Create your feature branch (`git checkout -b feature/YourFeature`)
3. Commit your changes (`git commit -m 'Add YourFeature'`)
4. Push to the branch (`git push origin feature/YourFeature`)
5. Open a pull request

## License

Licensed under the MIT License. Do whatever you want with it.
