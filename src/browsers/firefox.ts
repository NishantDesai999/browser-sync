import { existsSync, readFileSync } from "fs";
import { openSafeDb } from "../utils/sqlite.js";

export interface MozBookmarkRow {
  id: number;
  type: number; // 1 = bookmark, 2 = folder, 3 = separator
  parent: number;
  position: number;
  title: string | null;
  fk: number | null; // foreign key into moz_places
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

// Special Firefox root parent IDs
export const FIREFOX_ROOT_IDS = {
  root: 1,
  menu: 2,    // Other bookmarks
  toolbar: 3, // Bookmark bar
  tags: 4,
  unfiled: 5, // Unsorted bookmarks
  mobile: 6,
} as const;

export function readFirefoxBookmarks(dbPath: string): RawFirefoxTree {
  const { db, cleanup } = openSafeDb(dbPath);
  try {
    const rows = db
      .prepare(
        `SELECT b.id, b.type, b.parent, b.position, b.title, b.fk, b.dateAdded
         FROM moz_bookmarks b
         WHERE b.parent != ? -- exclude tags root and tag folders
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
