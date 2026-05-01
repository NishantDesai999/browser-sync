import { z } from "zod";

export type BookmarkNodeType = "bookmark" | "folder" | "separator";

export interface BookmarkNode {
  id: string;
  type: BookmarkNodeType;
  title: string;
  url?: string;
  addedAt?: number;
  children?: BookmarkNode[];
}

export interface BookmarkTree {
  version: 1;
  exportedAt: string;
  sourceVersion: string;
  roots: {
    bookmarkBar: BookmarkNode;
    other: BookmarkNode;
    mobile?: BookmarkNode;
  };
}

export interface ExtensionEntry {
  name: string;
  version?: string;
  firefoxId?: string;
  firefoxAmoUrl?: string;
  chromeWebStoreId?: string;
  chromeWebStoreUrl?: string;
}

export interface ExtensionList {
  version: 1;
  exportedAt: string;
  sourceVersion: string;
  entries: ExtensionEntry[];
}

export type BrowserName = "firefox" | "chrome" | "safari";

// Zod schemas for runtime validation

const bookmarkNodeSchema: z.ZodType<BookmarkNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: z.enum(["bookmark", "folder", "separator"]),
    title: z.string(),
    url: z.string().optional(),
    addedAt: z.number().optional(),
    children: z.array(bookmarkNodeSchema).optional(),
  })
);

export const bookmarkTreeSchema: z.ZodType<BookmarkTree> = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  sourceVersion: z.string(),
  roots: z.object({
    bookmarkBar: bookmarkNodeSchema,
    other: bookmarkNodeSchema,
    mobile: bookmarkNodeSchema.optional(),
  }),
});

export const extensionListSchema: z.ZodType<ExtensionList> = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  sourceVersion: z.string(),
  entries: z.array(
    z.object({
      name: z.string(),
      version: z.string().optional(),
      firefoxId: z.string().optional(),
      firefoxAmoUrl: z.string().optional(),
      chromeWebStoreId: z.string().optional(),
      chromeWebStoreUrl: z.string().optional(),
    })
  ),
});

export function flattenTree(node: BookmarkNode): BookmarkNode[] {
  const result: BookmarkNode[] = [node];
  if (node.children) {
    for (const child of node.children) {
      result.push(...flattenTree(child));
    }
  }
  return result;
}
