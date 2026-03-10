import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

export type ImportSource = {
  name: string;
  url: string;
  category: string;
};

export type ImportStats = {
  added: number;
  skipped: number;
  failed: number;
};

export type ImportResult = ImportStats & {
  failedItems: Array<{ source: ImportSource; error: string }>;
};

export function requireConvexUrlFromEnv(): string {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("Missing NEXT_PUBLIC_CONVEX_URL (expected in .env.local).");
  }
  return convexUrl;
}

export async function existingRssUrlSet(
  client: ConvexHttpClient,
): Promise<Set<string>> {
  const existing = await client.query(api.rss.list, {});
  return new Set(
    (existing as Array<{ url: string; originalUrl?: string | null }>).flatMap(
      (source) => {
        const urls = [source.url];
        if (source.originalUrl) urls.push(source.originalUrl);
        return urls;
      },
    ),
  );
}

export async function importRssSources(
  client: ConvexHttpClient,
  sources: ImportSource[],
  onProgress?: (event: { status: "added" | "skipped" | "failed"; source: ImportSource; error?: string }) => void,
): Promise<ImportResult> {
  const existingUrls = await existingRssUrlSet(client);
  const stats: ImportStats = { added: 0, skipped: 0, failed: 0 };
  const failedItems: Array<{ source: ImportSource; error: string }> = [];

  for (const source of sources) {
    if (existingUrls.has(source.url)) {
      stats.skipped += 1;
      onProgress?.({ status: "skipped", source });
      continue;
    }

    try {
      await client.action(api.rssActions.addVerifiedSource, source);
      existingUrls.add(source.url);
      stats.added += 1;
      onProgress?.({ status: "added", source });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stats.failed += 1;
      failedItems.push({ source, error: message });
      onProgress?.({ status: "failed", source, error: message });
    }
  }

  return { ...stats, failedItems };
}
