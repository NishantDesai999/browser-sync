import { randomUUID } from "crypto";
import {
  BookmarkNode,
  BookmarkTree,
  flattenTree,
} from "../types.js";
import {
  ChromeBookmarkFile,
  ChromeBookmarkNode,
} from "../browsers/chrome.js";
import {
  FIREFOX_ROOT_IDS,
  MozBookmarkRow,
  RawFirefoxTree,
} from "../browsers/firefox.js";
import { SafariBookmarkItem } from "../browsers/safari.js";

const VERSION = "0.1.0";

// --- UUID reconciliation ---

function stableId(url: string | undefined, existing: BookmarkNode[]): string {
  if (url) {
    const found = existing.find((n) => n.url === url);
    if (found) return found.id;
  }
  return randomUUID();
}

// --- Firefox → canonical ---

function buildFirefoxSubtree(
  parentId: number,
  rowsByParent: Map<number, MozBookmarkRow[]>,
  urlsById: Map<number, string>,
  existingFlat: BookmarkNode[]
): BookmarkNode[] {
  const children = rowsByParent.get(parentId) ?? [];
  return children.map((row): BookmarkNode => {
    if (row.type === 2) {
      // folder
      return {
        id: randomUUID(),
        type: "folder",
        title: row.title ?? "",
        addedAt: row.dateAdded ? Math.round(row.dateAdded / 1000) : undefined,
        children: buildFirefoxSubtree(row.id, rowsByParent, urlsById, existingFlat),
      };
    } else if (row.type === 3) {
      return { id: randomUUID(), type: "separator", title: "" };
    } else {
      // bookmark (type 1)
      const url = row.fk != null ? urlsById.get(row.fk) : undefined;
      // Skip internal Firefox URLs
      if (url && (url.startsWith("place:") || url.startsWith("about:"))) {
        return null as unknown as BookmarkNode;
      }
      return {
        id: stableId(url, existingFlat),
        type: "bookmark",
        title: row.title ?? "",
        url,
        addedAt: row.dateAdded ? Math.round(row.dateAdded / 1000) : undefined,
      };
    }
  }).filter(Boolean);
}

export function firefoxToCanonical(
  raw: RawFirefoxTree,
  existing?: BookmarkTree
): BookmarkTree {
  const existingFlat = existing
    ? [
        ...flattenTree(existing.roots.bookmarkBar),
        ...flattenTree(existing.roots.other),
        ...(existing.roots.mobile ? flattenTree(existing.roots.mobile) : []),
      ]
    : [];

  // Group rows by parent for efficient lookup
  const rowsByParent = new Map<number, MozBookmarkRow[]>();
  for (const row of raw.rows) {
    if (!rowsByParent.has(row.parent)) rowsByParent.set(row.parent, []);
    rowsByParent.get(row.parent)!.push(row);
  }

  const makeRoot = (id: number, title: string): BookmarkNode => ({
    id: randomUUID(),
    type: "folder",
    title,
    children: buildFirefoxSubtree(id, rowsByParent, raw.urlsById, existingFlat),
  });

  // Merge menu (id=2) and unfiled (id=5) into the "other" root
  const menuChildren = buildFirefoxSubtree(FIREFOX_ROOT_IDS.menu, rowsByParent, raw.urlsById, existingFlat);
  const unfiledChildren = buildFirefoxSubtree(FIREFOX_ROOT_IDS.unfiled, rowsByParent, raw.urlsById, existingFlat);
  const otherRoot: BookmarkNode = {
    id: randomUUID(),
    type: "folder",
    title: "Other Bookmarks",
    children: [...menuChildren, ...unfiledChildren],
  };

  const mobileChildren = buildFirefoxSubtree(FIREFOX_ROOT_IDS.mobile, rowsByParent, raw.urlsById, existingFlat);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    sourceVersion: VERSION,
    roots: {
      bookmarkBar: makeRoot(FIREFOX_ROOT_IDS.toolbar, "Bookmarks Bar"),
      other: otherRoot,
      mobile: mobileChildren.length > 0
        ? { id: randomUUID(), type: "folder", title: "Mobile Bookmarks", children: mobileChildren }
        : undefined,
    },
  };
}

// --- Chrome → canonical ---

function chromeNodeToCanonical(
  node: ChromeBookmarkNode,
  existingFlat: BookmarkNode[]
): BookmarkNode {
  if (node.type === "folder") {
    return {
      id: randomUUID(),
      type: "folder",
      title: node.name,
      // Chrome stores microseconds since Jan 1, 1601; convert to Unix ms
      addedAt: node.date_added ? chromeTimeToUnixMs(node.date_added) : undefined,
      children: (node.children ?? []).map((c) => chromeNodeToCanonical(c, existingFlat)),
    };
  }
  return {
    id: stableId(node.url, existingFlat),
    type: "bookmark",
    title: node.name,
    url: node.url,
    addedAt: node.date_added ? chromeTimeToUnixMs(node.date_added) : undefined,
  };
}

function chromeTimeToUnixMs(chromeTime: string): number {
  // Chrome: microseconds since 1601-01-01; Unix: ms since 1970-01-01
  // Difference: 11644473600 seconds = 11644473600000 ms = 11644473600000000 µs
  const CHROME_EPOCH_OFFSET_MS = 11644473600000n;
  const us = BigInt(chromeTime);
  return Number(us / 1000n - CHROME_EPOCH_OFFSET_MS);
}

export function chromeToCanonical(
  raw: ChromeBookmarkFile,
  existing?: BookmarkTree
): BookmarkTree {
  const existingFlat = existing
    ? [
        ...flattenTree(existing.roots.bookmarkBar),
        ...flattenTree(existing.roots.other),
      ]
    : [];

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    sourceVersion: VERSION,
    roots: {
      bookmarkBar: chromeNodeToCanonical(raw.roots.bookmark_bar, existingFlat),
      other: chromeNodeToCanonical(raw.roots.other, existingFlat),
    },
  };
}

// --- canonical → Chrome ---

function canonicalToChrome(node: BookmarkNode, idCounter: { v: number }): ChromeBookmarkNode {
  const id = String(idCounter.v++);
  if (node.type === "folder") {
    return {
      id,
      type: "folder",
      name: node.title,
      children: (node.children ?? []).map((c) => canonicalToChrome(c, idCounter)),
    };
  }
  return {
    id,
    type: "url",
    name: node.title,
    url: node.url ?? "",
  };
}

export function canonicalToChromeFile(tree: BookmarkTree): ChromeBookmarkFile {
  const counter = { v: 1 };
  return {
    roots: {
      bookmark_bar: canonicalToChrome(tree.roots.bookmarkBar, counter),
      other: canonicalToChrome(tree.roots.other, counter),
    },
  };
}

// --- Safari → canonical ---

function safariItemToCanonical(
  item: SafariBookmarkItem,
  existingFlat: BookmarkNode[]
): BookmarkNode | null {
  // Skip Reading List items
  if (item.ReadingList) return null;

  if (item.WebBookmarkType === "WebBookmarkTypeLeaf") {
    const url = item.URLString ?? item.URIDictionary?.href;
    if (!url) return null;
    return {
      id: stableId(url, existingFlat),
      type: "bookmark",
      title: item.URIDictionary?.title ?? item.Title ?? "",
      url,
    };
  }

  if (item.WebBookmarkType === "WebBookmarkTypeList" || item.Children) {
    const children = (item.Children ?? [])
      .map((c) => safariItemToCanonical(c, existingFlat))
      .filter(Boolean) as BookmarkNode[];
    return {
      id: randomUUID(),
      type: "folder",
      title: item.Title ?? "",
      children,
    };
  }

  return null;
}

export function safariToCanonical(
  raw: SafariBookmarkItem,
  existing?: BookmarkTree
): BookmarkTree {
  const existingFlat = existing
    ? [
        ...flattenTree(existing.roots.bookmarkBar),
        ...flattenTree(existing.roots.other),
      ]
    : [];

  const topLevel = raw.Children ?? [];

  const barItem = topLevel.find((c) => c.Title === "BookmarksBar");
  const menuItem = topLevel.find((c) => c.Title === "BookmarksMenu");

  const toRoot = (item: SafariBookmarkItem | undefined, fallbackTitle: string): BookmarkNode => {
    if (!item) return { id: randomUUID(), type: "folder", title: fallbackTitle, children: [] };
    const children = (item.Children ?? [])
      .map((c) => safariItemToCanonical(c, existingFlat))
      .filter(Boolean) as BookmarkNode[];
    return { id: randomUUID(), type: "folder", title: fallbackTitle, children };
  };

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    sourceVersion: VERSION,
    roots: {
      bookmarkBar: toRoot(barItem, "Bookmarks Bar"),
      other: toRoot(menuItem, "Other Bookmarks"),
    },
  };
}

// --- canonical → Netscape HTML (for Firefox/Safari import) ---

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nodeToHtml(node: BookmarkNode, depth: number): string {
  const indent = "    ".repeat(depth);
  if (node.type === "separator") return `${indent}<HR>`;
  if (node.type === "bookmark") {
    const addDate = node.addedAt ? ` ADD_DATE="${Math.round(node.addedAt / 1000)}"` : "";
    return `${indent}<DT><A HREF="${escapeHtml(node.url ?? "")}"${addDate}>${escapeHtml(node.title)}</A>`;
  }
  // folder
  const children = (node.children ?? []).map((c) => nodeToHtml(c, depth + 1)).join("\n");
  return `${indent}<DT><H3>${escapeHtml(node.title)}</H3>\n${indent}<DL><p>\n${children}\n${indent}</DL><p>`;
}

export function canonicalToNetscapeHtml(tree: BookmarkTree): string {
  const barHtml = nodeToHtml(tree.roots.bookmarkBar, 1);
  const otherHtml = nodeToHtml(tree.roots.other, 1);
  const mobileHtml = tree.roots.mobile ? nodeToHtml(tree.roots.mobile, 1) : "";

  return [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    "<!-- This is an automatically generated file.",
    "     It will be read and overwritten.",
    "     DO NOT EDIT! -->",
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    "<TITLE>Bookmarks</TITLE>",
    "<H1>Bookmarks</H1>",
    "<DL><p>",
    barHtml,
    otherHtml,
    mobileHtml,
    "</DL>",
  ]
    .filter(Boolean)
    .join("\n");
}
