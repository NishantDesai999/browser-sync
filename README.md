# browser-sync

A local-first CLI that syncs bookmarks and extension lists across **Firefox**, **Chrome**, and **Safari** on macOS. Your canonical bookmark state lives in a private **GitHub Gist** so it follows you across machines.

---

## How it works

```
Browser files on disk
  │
  ▼
[browser-sync pull <browser>]   → reads native format, normalizes, uploads to Gist
  │
  ▼
[GitHub Gist]                   → bookmarks.json + extensions.json (private)
  │
  ▼
[browser-sync push <browser>]   → downloads from Gist, writes to browser
```

**Write paths by browser:**
- **Chrome** — writes directly to the `Bookmarks` JSON file (Chrome must be closed)
- **Firefox** — exports a Netscape HTML file you import via the Bookmarks menu
- **Safari** — exports a Netscape HTML file you import via File > Import

Safari's extension API is App Store-only and cannot be automated, so extension sync covers Firefox and Chrome only.

---

## Requirements

- macOS (uses `plutil` for Safari plist parsing)
- Node.js 18+
- A GitHub account

---

## Installation

```bash
git clone <this-repo>
cd browser-sync
npm install
npm run build
npm install -g .
```

Or run directly during development:

```bash
npm run dev -- <command> [args]
```

---

## First-time setup

Create a GitHub Personal Access Token with the `gist` scope:
`https://github.com/settings/tokens/new?scopes=gist`

Then run:

```bash
browser-sync init
```

This prompts for your token, creates a private Gist called `browser-sync-data`, and saves your config to `~/.browser-sync/config.json`.

---

## Commands

### `pull <browser>`
Read bookmarks from a browser and save them to the Gist.

```bash
browser-sync pull firefox
browser-sync pull chrome
browser-sync pull safari
```

Also exports the extension list for Firefox and Chrome.

Options:
- `--dry-run` — show what would be saved without writing to Gist
- `--verbose` — print resolved file paths

---

### `push <browser>`
Load bookmarks from the Gist and write them to a browser.

```bash
browser-sync push chrome      # writes directly (Chrome must be closed)
browser-sync push firefox     # exports ~/.browser-sync/export.html
browser-sync push safari      # exports ~/.browser-sync/export.html
```

For Firefox, after running `push`:
> Bookmarks > Manage Bookmarks > Import and Backup > Import Bookmarks from HTML

For Safari, after running `push`:
> File > Import From > Bookmarks HTML File...

Options:
- `--dry-run` — simulate without writing
- `--verbose` — print resolved file paths

---

### `sync <from> <to>`
Pull from one browser and immediately push to another.

```bash
browser-sync sync firefox chrome
browser-sync sync chrome safari
```

---

### `extensions <browser>`
Export the installed extension list to the Gist and print a table with install links.

```bash
browser-sync extensions firefox
browser-sync extensions chrome --merge   # merge with existing list instead of replacing
```

Output:
```
────────────────────────────────────────────────────────────────────────────────
Name                                Firefox                Chrome
────────────────────────────────────────────────────────────────────────────────
uBlock Origin                       AMO ✓                  Store ✓
HTTPS Everywhere                    AMO ✓                  Store ✓
────────────────────────────────────────────────────────────────────────────────
```

Options:
- `--dry-run` — print without saving to Gist
- `--merge` — merge new results with the existing Gist list

---

## Typical workflows

**Daily driver is Firefox, want Chrome to match:**
```bash
browser-sync sync firefox chrome
```

**Setting up a fresh machine:**
```bash
browser-sync init                      # enter your GitHub token
browser-sync push chrome               # restore bookmarks from Gist
browser-sync extensions firefox        # see which extensions to reinstall
```

**Bidirectional: pulled something into Chrome, want Firefox to have it:**
```bash
browser-sync sync chrome firefox
```

---

## File locations

| Browser | Bookmarks path |
|---|---|
| Chrome | `~/Library/Application Support/Google/Chrome/Default/Bookmarks` |
| Firefox | `~/Library/Application Support/Firefox/Profiles/<default>/places.sqlite` |
| Safari | `~/Library/Safari/Bookmarks.plist` |

Config and exports: `~/.browser-sync/`

---

## Notes

- **Firefox/Chrome must not be running** when browser-sync reads the SQLite DB (a temp copy is made automatically, so it usually works fine; Chrome must be closed for writes).
- Bookmark IDs are stable across re-pulls: the same URL always gets the same UUID, so future diff/merge features will work correctly.
- The Gist is **private** by default. Never share your `~/.browser-sync/config.json` — it contains your GitHub token.
- Safari extensions must be installed manually from the App Store.

---

## Development

```bash
npm run dev -- pull firefox       # run without building
npm test                          # run vitest unit tests
npm run build                     # compile to dist/
```

Project structure:
```
src/
├── cli.ts                   Commander entrypoint
├── types.ts                 Canonical types + Zod schemas
├── browsers/                Native format readers
├── adapters/                Format conversion logic
├── store/gist-store.ts      GitHub Gist read/write
├── commands/                pull / push / sync / extensions / init
└── utils/                   paths, sqlite, plist, logger
```
