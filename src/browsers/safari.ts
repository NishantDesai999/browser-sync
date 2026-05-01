import { execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import plist from "plist";
import { readBinaryPlist } from "../utils/plist.js";
import { BookmarkNode, BookmarkTree } from "../types.js";

export interface SafariBookmarkItem {
  WebBookmarkType: string;
  URIDictionary?: { href?: string; title?: string };
  ReadingList?: object;
  Title?: string;
  Children?: SafariBookmarkItem[];
  URLString?: string;
  WebBookmarkUUID?: string;
}

export function isSafariRunning(): boolean {
  try {
    execSync("pgrep -x Safari", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function readSafariBookmarks(plistPath: string): SafariBookmarkItem {
  if (!existsSync(plistPath)) {
    throw new Error(`Safari Bookmarks.plist not found: ${plistPath}. Is Safari installed?`);
  }
  return readBinaryPlist(plistPath) as SafariBookmarkItem;
}

export function readSafariExtensions(): never[] {
  return [];
}

// --- Write ---

function canonicalNodeToSafari(node: BookmarkNode): SafariBookmarkItem | null {
  if (node.type === "separator") return null;

  if (node.type === "folder") {
    return {
      WebBookmarkType: "WebBookmarkTypeList",
      Title: node.title,
      WebBookmarkUUID: randomUUID().toUpperCase(),
      Children: (node.children ?? [])
        .map(canonicalNodeToSafari)
        .filter(Boolean) as SafariBookmarkItem[],
    };
  }

  if (!node.url) return null;
  return {
    WebBookmarkType: "WebBookmarkTypeLeaf",
    URLString: node.url,
    URIDictionary: { href: node.url, title: node.title },
    WebBookmarkUUID: randomUUID().toUpperCase(),
  };
}

export function writeSafariBookmarks(tree: BookmarkTree, plistPath: string): string {
  if (isSafariRunning()) {
    throw new Error("Safari is currently running. Close Safari before pushing bookmarks.");
  }

  // Read existing plist to preserve non-bookmark sections (Reading List, History, etc.)
  const existing = readSafariBookmarks(plistPath) as SafariBookmarkItem;

  // Backup
  const backupPath = `${plistPath}.bsync-backup`;
  execSync(`cp "${plistPath}" "${backupPath}"`);

  // Build new children for BookmarksBar and BookmarksMenu from canonical tree
  const newBarChildren = (tree.roots.bookmarkBar.children ?? [])
    .map(canonicalNodeToSafari)
    .filter(Boolean) as SafariBookmarkItem[];

  const newMenuChildren = (tree.roots.other.children ?? [])
    .map(canonicalNodeToSafari)
    .filter(Boolean) as SafariBookmarkItem[];

  // Replace only the BookmarksBar and BookmarksMenu sections; keep everything else
  const newRoot: SafariBookmarkItem = {
    ...existing,
    Children: (existing.Children ?? []).map((child) => {
      if (child.Title === "BookmarksBar") {
        return { ...child, Children: newBarChildren };
      }
      if (child.Title === "BookmarksMenu") {
        return { ...child, Children: newMenuChildren };
      }
      return child; // Preserve Reading List, History, etc.
    }),
  };

  // If BookmarksBar/Menu don't exist in the plist yet, add them
  const hasBars = (existing.Children ?? []).some(
    (c) => c.Title === "BookmarksBar" || c.Title === "BookmarksMenu"
  );
  if (!hasBars) {
    newRoot.Children = [
      ...(newRoot.Children ?? []),
      {
        WebBookmarkType: "WebBookmarkTypeList",
        Title: "BookmarksBar",
        WebBookmarkUUID: randomUUID().toUpperCase(),
        Children: newBarChildren,
      },
      {
        WebBookmarkType: "WebBookmarkTypeList",
        Title: "BookmarksMenu",
        WebBookmarkUUID: randomUUID().toUpperCase(),
        Children: newMenuChildren,
      },
    ];
  }

  // Write as XML plist to a temp file, then convert to binary
  const tmpXml = join(tmpdir(), `bsync-safari-${Date.now()}.plist`);
  writeFileSync(tmpXml, plist.build(newRoot as unknown as plist.PlistValue), "utf-8");
  execSync(`plutil -convert binary1 "${tmpXml}" -o "${plistPath}"`);

  return backupPath;
}
