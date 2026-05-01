import { existsSync } from "fs";
import { readBinaryPlist } from "../utils/plist.js";

export interface SafariBookmarkItem {
  WebBookmarkType: string;
  URIDictionary?: { href?: string; title?: string };
  ReadingList?: object;
  Title?: string;
  Children?: SafariBookmarkItem[];
  URLString?: string;
}

export function readSafariBookmarks(plistPath: string): SafariBookmarkItem {
  if (!existsSync(plistPath)) {
    throw new Error(`Safari Bookmarks.plist not found: ${plistPath}. Is Safari installed?`);
  }
  return readBinaryPlist(plistPath) as SafariBookmarkItem;
}

// Safari extensions cannot be read programmatically — they're App Store only
export function readSafariExtensions(): never[] {
  return [];
}
