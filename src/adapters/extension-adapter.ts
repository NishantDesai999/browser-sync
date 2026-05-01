import { ExtensionEntry, ExtensionList } from "../types.js";
import { ChromeRawExtension } from "../browsers/chrome.js";
import { FirefoxRawExtension } from "../browsers/firefox.js";

const VERSION = "0.1.0";

function amoUrl(id: string): string | undefined {
  // System/built-in extensions don't have AMO pages
  if (id.startsWith("{") || id.includes("@mozilla")) return undefined;
  return `https://addons.mozilla.org/en-US/firefox/addon/${encodeURIComponent(id)}/`;
}

function chromeStoreUrl(id: string): string {
  return `https://chrome.google.com/webstore/detail/${id}`;
}

export function firefoxExtensionsToCanonical(raw: FirefoxRawExtension[]): ExtensionList {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    sourceVersion: VERSION,
    entries: raw.map((ext): ExtensionEntry => ({
      name: ext.name,
      version: ext.version,
      firefoxId: ext.id,
      firefoxAmoUrl: amoUrl(ext.id),
    })),
  };
}

export function chromeExtensionsToCanonical(raw: ChromeRawExtension[]): ExtensionList {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    sourceVersion: VERSION,
    entries: raw.map((ext): ExtensionEntry => ({
      name: ext.name,
      version: ext.version,
      chromeWebStoreId: ext.id,
      chromeWebStoreUrl: chromeStoreUrl(ext.id),
    })),
  };
}

export function mergeExtensionLists(lists: ExtensionList[]): ExtensionList {
  const merged = new Map<string, ExtensionEntry>();

  for (const list of lists) {
    for (const entry of list.entries) {
      const key = entry.name.toLowerCase().trim();
      if (merged.has(key)) {
        // Merge IDs from both browsers into the same entry
        const existing = merged.get(key)!;
        merged.set(key, {
          ...existing,
          firefoxId: entry.firefoxId ?? existing.firefoxId,
          firefoxAmoUrl: entry.firefoxAmoUrl ?? existing.firefoxAmoUrl,
          chromeWebStoreId: entry.chromeWebStoreId ?? existing.chromeWebStoreId,
          chromeWebStoreUrl: entry.chromeWebStoreUrl ?? existing.chromeWebStoreUrl,
        });
      } else {
        merged.set(key, { ...entry });
      }
    }
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    sourceVersion: VERSION,
    entries: [...merged.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
