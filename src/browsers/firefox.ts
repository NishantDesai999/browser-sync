import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { randomBytes } from "crypto";
import Database from "better-sqlite3";
import { openSafeDb, openWritableDb } from "../utils/sqlite.js";
import { BookmarkNode, BookmarkTree } from "../types.js";

export interface MozBookmarkRow {
  id: number;
  type: number; // 1 = bookmark, 2 = folder, 3 = separator
  parent: number;
  position: number;
  title: string | null;
  fk: number | null;
  dateAdded: number | null;
}

export interface MozPlaceRow {
  id: number;
  url: string;
}

export interface RawFirefoxTree {
  rows: MozBookmarkRow[];
  urlsById: Map<number, string>;
}

export const FIREFOX_ROOT_IDS = {
  root: 1,
  menu: 2,
  toolbar: 3,
  tags: 4,
  unfiled: 5,
  mobile: 6,
} as const;

export function isFirefoxRunning(): boolean {
  try {
    execSync("pgrep -xi firefox", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function readFirefoxBookmarks(dbPath: string): RawFirefoxTree {
  const { db, cleanup } = openSafeDb(dbPath);
  try {
    const rows = db
      .prepare(
        `SELECT b.id, b.type, b.parent, b.position, b.title, b.fk, b.dateAdded
         FROM moz_bookmarks b
         WHERE b.parent != ?
         ORDER BY b.parent, b.position`
      )
      .all(FIREFOX_ROOT_IDS.tags) as MozBookmarkRow[];

    const places = db
      .prepare("SELECT id, url FROM moz_places")
      .all() as MozPlaceRow[];

    const urlsById = new Map<number, string>(places.map((p) => [p.id, p.url]));
    return { rows, urlsById };
  } finally {
    cleanup();
  }
}

// --- Write ---

function guid(): string {
  // Firefox uses 12-char base64url GUIDs
  return randomBytes(9).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

function revHost(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    if (!hostname) return ".";
    return hostname.split("").reverse().join("") + ".";
  } catch {
    return ".";
  }
}

function clearRoot(db: Database.Database, parentId: number): void {
  const children = db
    .prepare("SELECT id, type, fk FROM moz_bookmarks WHERE parent = ?")
    .all(parentId) as { id: number; type: number; fk: number | null }[];

  for (const child of children) {
    if (child.type === 2) clearRoot(db, child.id);
    if (child.type === 1 && child.fk !== null) {
      db.prepare(
        "UPDATE moz_places SET foreign_count = MAX(0, foreign_count - 1) WHERE id = ?"
      ).run(child.fk);
    }
    db.prepare("DELETE FROM moz_bookmarks WHERE id = ?").run(child.id);
  }
}

function getOrInsertPlace(
  db: Database.Database,
  url: string,
  title: string | null
): number {
  const existing = db
    .prepare("SELECT id FROM moz_places WHERE url = ?")
    .get(url) as { id: number } | undefined;
  if (existing) return existing.id;

  const result = db
    .prepare(
      `INSERT INTO moz_places
         (url, title, rev_host, visit_count, hidden, typed, frecency, guid, foreign_count, url_hash)
       VALUES (?, ?, ?, 0, 0, 0, 0, ?, 0, 0)`
    )
    .run(url, title ?? null, revHost(url), guid());

  return result.lastInsertRowid as number;
}

function insertNodes(
  db: Database.Database,
  nodes: BookmarkNode[],
  parentId: number,
  now: number
): void {
  const insertBookmark = db.prepare(
    `INSERT INTO moz_bookmarks
       (type, fk, parent, position, title, dateAdded, lastModified, guid, syncStatus, syncChangeCounter)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, 0, 1)`
  );
  const insertFolder = db.prepare(
    `INSERT INTO moz_bookmarks
       (type, parent, position, title, dateAdded, lastModified, guid, syncStatus, syncChangeCounter)
     VALUES (2, ?, ?, ?, ?, ?, ?, 0, 1)`
  );
  const updateForeignCount = db.prepare(
    "UPDATE moz_places SET foreign_count = foreign_count + 1 WHERE id = ?"
  );

  nodes.forEach((node, position) => {
    if (node.type === "separator") return;

    if (node.type === "folder") {
      const result = insertFolder.run(
        parentId, position, node.title, now, now, guid()
      );
      insertNodes(db, node.children ?? [], result.lastInsertRowid as number, now);
    } else if (node.url) {
      const placeId = getOrInsertPlace(db, node.url, node.title);
      insertBookmark.run(placeId, parentId, position, node.title, now, now, guid());
      updateForeignCount.run(placeId);
    }
  });
}

export function writeFirefoxBookmarks(tree: BookmarkTree, dbPath: string): string {
  if (isFirefoxRunning()) {
    throw new Error(
      "Firefox is currently running. Close Firefox before pushing bookmarks."
    );
  }

  // Backup
  const backupPath = `${dbPath}.bsync-backup`;
  writeFileSync(backupPath, readFileSync(dbPath));

  const db = openWritableDb(dbPath);
  const now = Date.now() * 1000; // microseconds

  try {
    db.transaction(() => {
      // Clear standard roots and repopulate from canonical tree
      clearRoot(db, FIREFOX_ROOT_IDS.toolbar);
      clearRoot(db, FIREFOX_ROOT_IDS.menu);
      clearRoot(db, FIREFOX_ROOT_IDS.unfiled);

      insertNodes(db, tree.roots.bookmarkBar.children ?? [], FIREFOX_ROOT_IDS.toolbar, now);
      insertNodes(db, tree.roots.other.children ?? [], FIREFOX_ROOT_IDS.menu, now);
      if (tree.roots.mobile) {
        insertNodes(db, tree.roots.mobile.children ?? [], FIREFOX_ROOT_IDS.mobile, now);
      }
    })();
  } finally {
    db.close();
  }

  return backupPath;
}

export interface FirefoxRawExtension {
  id: string;
  name: string;
  version: string;
  active: boolean;
}

export function readFirefoxExtensions(extensionsJsonPath: string): FirefoxRawExtension[] {
  if (!existsSync(extensionsJsonPath)) return [];
  const raw = JSON.parse(readFileSync(extensionsJsonPath, "utf-8")) as {
    addons?: Array<{
      id: string;
      defaultLocale?: { name?: string };
      version?: string;
      active?: boolean;
      type?: string;
    }>;
  };

  return (raw.addons ?? [])
    .filter((a) => a.type === "extension" && a.active !== false)
    .map((a) => ({
      id: a.id,
      name: a.defaultLocale?.name ?? a.id,
      version: a.version ?? "",
      active: a.active ?? true,
    }));
}
