import { describe, it, expect } from "vitest";
import {
  firefoxExtensionsToCanonical,
  chromeExtensionsToCanonical,
  mergeExtensionLists,
} from "../../src/adapters/extension-adapter.js";
import { FirefoxRawExtension } from "../../src/browsers/firefox.js";
import { ChromeRawExtension } from "../../src/browsers/chrome.js";

const ffRaw: FirefoxRawExtension[] = [
  { id: "ublock-origin@gorhill.github.com", name: "uBlock Origin", version: "1.60.0", active: true },
  { id: "https-everywhere@eff.org", name: "HTTPS Everywhere", version: "2022.5.11", active: true },
];

const chromeRaw: ChromeRawExtension[] = [
  { id: "cjpalhdlnbpafiamejdnhcphjbkeiagm", name: "uBlock Origin", version: "1.60.0" },
  { id: "gcbommkclmclpchllfjekcdonpmejbdp", name: "HTTPS Everywhere", version: "2022.5.11" },
];

describe("firefoxExtensionsToCanonical", () => {
  it("maps extensions to entries with firefoxId", () => {
    const list = firefoxExtensionsToCanonical(ffRaw);
    expect(list.entries).toHaveLength(2);
    expect(list.entries[0].firefoxId).toBe("ublock-origin@gorhill.github.com");
    expect(list.entries[0].name).toBe("uBlock Origin");
  });

  it("excludes entries with curly-brace IDs from AMO URL (system extensions)", () => {
    const sysExt: FirefoxRawExtension[] = [
      { id: "{a23983c0-fd0e-11dc-95ff-0800200c9a66}", name: "System Ext", version: "1.0", active: true },
    ];
    const list = firefoxExtensionsToCanonical(sysExt);
    expect(list.entries[0].firefoxAmoUrl).toBeUndefined();
  });
});

describe("chromeExtensionsToCanonical", () => {
  it("maps extensions to entries with chromeWebStoreId", () => {
    const list = chromeExtensionsToCanonical(chromeRaw);
    expect(list.entries).toHaveLength(2);
    expect(list.entries[0].chromeWebStoreId).toBe("cjpalhdlnbpafiamejdnhcphjbkeiagm");
  });

  it("generates correct Chrome Web Store URL", () => {
    const list = chromeExtensionsToCanonical(chromeRaw);
    expect(list.entries[0].chromeWebStoreUrl).toContain("cjpalhdlnbpafiamejdnhcphjbkeiagm");
  });
});

describe("mergeExtensionLists", () => {
  it("merges matching extension names from both browsers", () => {
    const ffList = firefoxExtensionsToCanonical(ffRaw);
    const chromeList = chromeExtensionsToCanonical(chromeRaw);
    const merged = mergeExtensionLists([ffList, chromeList]);

    expect(merged.entries).toHaveLength(2);
    const ublock = merged.entries.find((e) => e.name === "uBlock Origin")!;
    expect(ublock.firefoxId).toBeTruthy();
    expect(ublock.chromeWebStoreId).toBeTruthy();
  });

  it("sorts merged entries by name", () => {
    const ffList = firefoxExtensionsToCanonical(ffRaw);
    const chromeList = chromeExtensionsToCanonical(chromeRaw);
    const merged = mergeExtensionLists([ffList, chromeList]);
    const names = merged.entries.map((e) => e.name);
    expect(names).toEqual([...names].sort());
  });

  it("deduplicates case-insensitively", () => {
    const a = firefoxExtensionsToCanonical([
      { id: "ext-a@test.com", name: "My Extension", version: "1.0", active: true },
    ]);
    const b = chromeExtensionsToCanonical([
      { id: "abcdefghijklmnopqrstuvwxyz123456", name: "my extension", version: "1.0" },
    ]);
    const merged = mergeExtensionLists([a, b]);
    expect(merged.entries).toHaveLength(1);
  });
});
