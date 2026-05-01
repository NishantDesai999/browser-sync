import { describe, it, expect } from "vitest";
import plist from "plist";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import {
  chromeToCanonical,
  safariToCanonical,
  canonicalToChromeFile,
  canonicalToNetscapeHtml,
} from "../../src/adapters/bookmark-adapter.js";
import { ChromeBookmarkFile } from "../../src/browsers/chrome.js";
import { SafariBookmarkItem } from "../../src/browsers/safari.js";
import { BookmarkTree } from "../../src/types.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const fixturesDir = join(__dirname, "../fixtures");

function loadChromeFixture(): ChromeBookmarkFile {
  return JSON.parse(
    readFileSync(join(fixturesDir, "chrome-bookmarks.json"), "utf-8")
  ) as ChromeBookmarkFile;
}

function loadSafariFixture(): SafariBookmarkItem {
  const xml = readFileSync(join(fixturesDir, "safari-bookmarks.xml"), "utf-8");
  return plist.parse(xml) as SafariBookmarkItem;
}

describe("chromeToCanonical", () => {
  it("preserves the bookmark bar root", () => {
    const tree = chromeToCanonical(loadChromeFixture());
    expect(tree.roots.bookmarkBar.type).toBe("folder");
    expect(tree.roots.bookmarkBar.children).toHaveLength(2);
  });

  it("maps a URL node to a bookmark type with correct url", () => {
    const tree = chromeToCanonical(loadChromeFixture());
    const github = tree.roots.bookmarkBar.children![0];
    expect(github.type).toBe("bookmark");
    expect(github.url).toBe("https://github.com");
    expect(github.title).toBe("GitHub");
  });

  it("preserves nested folder hierarchy", () => {
    const tree = chromeToCanonical(loadChromeFixture());
    const devTools = tree.roots.bookmarkBar.children![1];
    expect(devTools.type).toBe("folder");
    expect(devTools.children).toHaveLength(1);
    expect(devTools.children![0].url).toBe("https://developer.mozilla.org");
  });

  it("maps other bookmarks root", () => {
    const tree = chromeToCanonical(loadChromeFixture());
    expect(tree.roots.other.children).toHaveLength(1);
    expect(tree.roots.other.children![0].url).toBe("https://news.ycombinator.com");
  });

  it("reuses UUIDs for existing URLs on re-pull", () => {
    const first = chromeToCanonical(loadChromeFixture());
    const second = chromeToCanonical(loadChromeFixture(), first);
    const firstGithub = first.roots.bookmarkBar.children![0];
    const secondGithub = second.roots.bookmarkBar.children![0];
    expect(firstGithub.id).toBe(secondGithub.id);
  });
});

describe("canonicalToChromeFile", () => {
  it("round-trips through Chrome format preserving URLs", () => {
    const original = chromeToCanonical(loadChromeFixture());
    const chromeFile = canonicalToChromeFile(original);
    const restored = chromeToCanonical(chromeFile);

    const originalUrls = collectUrls(original.roots.bookmarkBar).sort();
    const restoredUrls = collectUrls(restored.roots.bookmarkBar).sort();
    expect(restoredUrls).toEqual(originalUrls);
  });
});

describe("safariToCanonical", () => {
  it("maps BookmarksBar to bookmarkBar root", () => {
    const tree = safariToCanonical(loadSafariFixture());
    expect(tree.roots.bookmarkBar.title).toBe("Bookmarks Bar");
    expect(tree.roots.bookmarkBar.children).toHaveLength(2);
  });

  it("parses leaf URL nodes correctly", () => {
    const tree = safariToCanonical(loadSafariFixture());
    const apple = tree.roots.bookmarkBar.children![0];
    expect(apple.type).toBe("bookmark");
    expect(apple.url).toBe("https://apple.com");
    expect(apple.title).toBe("Apple");
  });

  it("preserves nested Safari folders", () => {
    const tree = safariToCanonical(loadSafariFixture());
    const newsFolder = tree.roots.bookmarkBar.children![1];
    expect(newsFolder.type).toBe("folder");
    expect(newsFolder.children).toHaveLength(1);
    expect(newsFolder.children![0].url).toBe("https://bbc.com");
  });

  it("maps BookmarksMenu to other root", () => {
    const tree = safariToCanonical(loadSafariFixture());
    expect(tree.roots.other.children).toHaveLength(1);
    expect(tree.roots.other.children![0].url).toBe("https://example.com");
  });
});

describe("canonicalToNetscapeHtml", () => {
  it("produces DOCTYPE header", () => {
    const tree = chromeToCanonical(loadChromeFixture());
    const html = canonicalToNetscapeHtml(tree);
    expect(html).toContain("NETSCAPE-Bookmark-file-1");
  });

  it("includes all bookmark URLs as <A HREF=...> tags", () => {
    const tree = chromeToCanonical(loadChromeFixture());
    const html = canonicalToNetscapeHtml(tree);
    expect(html).toContain('HREF="https://github.com"');
    expect(html).toContain('HREF="https://developer.mozilla.org"');
    expect(html).toContain('HREF="https://news.ycombinator.com"');
  });

  it("wraps folders in <DL> tags", () => {
    const tree = chromeToCanonical(loadChromeFixture());
    const html = canonicalToNetscapeHtml(tree);
    expect(html).toContain("<DL>");
    expect(html).toContain("<H3>Dev Tools</H3>");
  });

  it("escapes special characters in titles", () => {
    const tree: BookmarkTree = {
      version: 1,
      exportedAt: new Date().toISOString(),
      sourceVersion: "0.1.0",
      roots: {
        bookmarkBar: {
          id: "bar",
          type: "folder",
          title: "Bar",
          children: [
            {
              id: "bm",
              type: "bookmark",
              title: "A & B < C > D",
              url: "https://example.com?a=1&b=2",
            },
          ],
        },
        other: { id: "other", type: "folder", title: "Other", children: [] },
      },
    };
    const html = canonicalToNetscapeHtml(tree);
    expect(html).toContain("A &amp; B &lt; C &gt; D");
    expect(html).toContain("https://example.com?a=1&amp;b=2");
  });
});

function collectUrls(node: BookmarkTree["roots"]["bookmarkBar"]): string[] {
  if (node.type === "bookmark" && node.url) return [node.url];
  return (node.children ?? []).flatMap(collectUrls);
}
