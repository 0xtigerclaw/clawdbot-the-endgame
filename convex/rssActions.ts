"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import Parser from "rss-parser";
import type { Id } from "./_generated/dataModel";
import { normalizeSourceName } from "../lib/sourceNames";

const parser = new Parser();

type FeedItem = {
    title: string;
    link: string;
    pubDate: string;
    isoDate?: string;
    contentSnippet: string;
};

type ParsedFeedResult =
    | { ok: true; resolvedUrl: string; title: string; items: FeedItem[]; attemptedUrls: string[] }
    | { ok: false; error: string; attemptedUrls: string[] };

function uniqPreserveOrder(values: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const value of values) {
        if (!value) continue;
        const trimmed = value.trim();
        if (!trimmed) continue;
        if (seen.has(trimmed)) continue;
        seen.add(trimmed);
        out.push(trimmed);
    }
    return out;
}

function guessCandidateFeedUrls(inputUrl: string): string[] {
    let url: URL;
    try {
        url = new URL(inputUrl);
    } catch {
        return [];
    }

    const candidates: string[] = [];
    const asString = url.toString();
    const withTrailingSlash = asString.endsWith("/") ? asString : `${asString}/`;

    // Common patterns
    candidates.push(withTrailingSlash + "feed/");
    candidates.push(withTrailingSlash + "rss.xml");
    candidates.push(withTrailingSlash + "atom.xml");
    candidates.push(withTrailingSlash + "feed.xml");

    // TechCrunch (WordPress): category/tag feeds are typically .../feed/
    if (url.hostname.endsWith("techcrunch.com")) {
        if (!url.pathname.endsWith("/feed/")) {
            candidates.push(new URL(url.pathname.replace(/\/?$/, "/feed/"), url.origin).toString());
        }
    }

    // DeepMind blog seems to expose rss.xml under the same path
    if (url.hostname === "deepmind.google") {
        candidates.push(new URL("rss.xml", withTrailingSlash).toString());
    }

    return uniqPreserveOrder(candidates);
}

function looksLikeHtml(contentType: string | null, body: string): boolean {
    if (contentType?.toLowerCase().includes("text/html")) return true;
    const trimmed = body.trimStart().slice(0, 256).toLowerCase();
    return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}

function looksLikeXml(contentType: string | null, body: string): boolean {
    if (contentType?.toLowerCase().includes("xml")) return true;
    const trimmed = body.trimStart().slice(0, 256).toLowerCase();
    return trimmed.startsWith("<?xml") || trimmed.startsWith("<rss") || trimmed.startsWith("<feed");
}

function sanitizeLikelyXml(xml: string): string {
    // Escape stray ampersands that aren't part of a valid entity.
    // This helps with some real-world feeds that ship malformed XML.
    return xml.replace(/&(?![a-zA-Z]+;|#\d+;|#x[0-9a-fA-F]+;)/g, "&amp;");
}

function extractAlternateFeedLinks(html: string, baseUrl: string): string[] {
    const candidates: string[] = [];

    // Extract <link rel="alternate" type="application/rss+xml" href="...">
    const linkTagRegex = /<link\b[^>]*>/gi;
    const attrRegex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*["']([^"']+)["']/g;

    for (const tag of html.match(linkTagRegex) ?? []) {
        const attrs: Record<string, string> = {};
        let match: RegExpExecArray | null;
        while ((match = attrRegex.exec(tag))) {
            attrs[match[1].toLowerCase()] = match[2];
        }

        const rel = (attrs["rel"] || "").toLowerCase();
        if (!rel.split(/\s+/).includes("alternate")) continue;

        const type = (attrs["type"] || "").toLowerCase();
        if (!type.includes("rss") && !type.includes("atom") && !type.includes("xml")) continue;

        const href = attrs["href"];
        if (!href) continue;

        try {
            candidates.push(new URL(href, baseUrl).toString());
        } catch {
            // ignore
        }
    }

    // Heuristic: direct anchor links containing rss/atom/feed
    const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
    let a: RegExpExecArray | null;
    while ((a = anchorRegex.exec(html))) {
        const href = a[1];
        if (!href) continue;
        const lower = href.toLowerCase();
        if (!lower.includes("rss") && !lower.includes("atom") && !lower.includes("feed")) continue;
        try {
            candidates.push(new URL(href, baseUrl).toString());
        } catch {
            // ignore
        }
    }

    return uniqPreserveOrder(candidates);
}

async function fetchTextWithMeta(url: string): Promise<{ finalUrl: string; contentType: string | null; text: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
        const res = await fetch(url, {
            redirect: "follow",
            signal: controller.signal,
            headers: {
                "user-agent": "Mozilla/5.0 (compatible; ClawdScout/1.0)",
                "accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8",
            },
        });
        const text = await res.text();
        return { finalUrl: res.url || url, contentType: res.headers.get("content-type"), text };
    } finally {
        clearTimeout(timeout);
    }
}

async function tryParseFeedFromText(text: string, resolvedUrl: string): Promise<{ ok: true; resolvedUrl: string; title: string; items: FeedItem[] } | { ok: false; error: string }> {
    try {
        const feed = await parser.parseString(text);
        const items: FeedItem[] = feed.items.slice(0, 20).map((item) => ({
            title: item.title || "Untitled",
            link: item.link || "",
            pubDate: item.pubDate || "",
            isoDate: (item as unknown as { isoDate?: string }).isoDate || "",
            contentSnippet: item.contentSnippet || "",
        }));
        return { ok: true, resolvedUrl, title: feed.title || "", items };
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        const sanitized = sanitizeLikelyXml(text);
        if (sanitized !== text) {
            const feed = await parser.parseString(sanitized);
            const items: FeedItem[] = feed.items.slice(0, 20).map((item) => ({
                title: item.title || "Untitled",
                link: item.link || "",
                pubDate: item.pubDate || "",
                isoDate: (item as unknown as { isoDate?: string }).isoDate || "",
                contentSnippet: item.contentSnippet || "",
            }));
            return { ok: true, resolvedUrl, title: feed.title || "", items };
        }
        return { ok: false, error: message };
    }
}

function parseItemTimestampMs(item: FeedItem): number | null {
    const candidate = (item.isoDate || item.pubDate || "").trim();
    if (!candidate) return null;
    const ms = Date.parse(candidate);
    return Number.isFinite(ms) ? ms : null;
}

async function tryParseFeedFromUrl(url: string): Promise<{ ok: true; resolvedUrl: string; title: string; items: FeedItem[] } | { ok: false; error: string }> {
    try {
        const { finalUrl, contentType, text } = await fetchTextWithMeta(url);
        if (!looksLikeXml(contentType, text)) {
            return { ok: false, error: `Not an RSS/Atom/XML response (content-type: ${contentType ?? "unknown"})` };
        }
        return await tryParseFeedFromText(text, finalUrl);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return { ok: false, error: message };
    }
}

async function parseFeedSmart(inputUrl: string): Promise<ParsedFeedResult> {
    const attemptedUrls: string[] = [];

    // 1) Try the given URL first.
    attemptedUrls.push(inputUrl);
    const initialFetch = await fetchTextWithMeta(inputUrl);
    const initialIsHtml = looksLikeHtml(initialFetch.contentType, initialFetch.text);

    if (!initialIsHtml && looksLikeXml(initialFetch.contentType, initialFetch.text)) {
        const direct = await tryParseFeedFromText(initialFetch.text, initialFetch.finalUrl);
        if (direct.ok) {
            return { ok: true, resolvedUrl: direct.resolvedUrl, title: direct.title, items: direct.items, attemptedUrls };
        }
    }

    // 2) If it's HTML, attempt feed discovery via <link rel="alternate">.
    const discoveredFromHtml = initialIsHtml ? extractAlternateFeedLinks(initialFetch.text, initialFetch.finalUrl) : [];
    const guessed = guessCandidateFeedUrls(initialFetch.finalUrl);
    // Prefer heuristic candidates first so category/tag pages map to their specific feed
    // instead of a generic site-wide feed advertised in the HTML head.
    const candidates = uniqPreserveOrder([...guessed, ...discoveredFromHtml]);

    let lastError = "Unknown error";
    for (const candidate of candidates) {
        attemptedUrls.push(candidate);
        const parsed = await tryParseFeedFromUrl(candidate);
        if (parsed.ok) {
            return {
                ok: true,
                resolvedUrl: parsed.resolvedUrl,
                title: parsed.title,
                items: parsed.items,
                attemptedUrls: uniqPreserveOrder(attemptedUrls),
            };
        }
        lastError = parsed.error;
    }

    return { ok: false, error: lastError, attemptedUrls: uniqPreserveOrder(attemptedUrls) };
}

export const parseFeed = action({
    args: { url: v.string(), sourceId: v.optional(v.id("rss_sources")) },
    handler: async (ctx, args) => {
        try {
            console.log(`[RSS] Fetching ${args.url}...`);
            const parsed = await parseFeedSmart(args.url);

            if (!parsed.ok) {
                if (args.sourceId) {
                    await ctx.runMutation(api.rss.recordFailure, {
                        id: args.sourceId,
                        attemptedAt: Date.now(),
                        error: parsed.error,
                    });
                }
                return { error: parsed.error, attemptedUrls: parsed.attemptedUrls };
            }

            if (args.sourceId) {
                await ctx.runMutation(api.rss.updateLastScrapedAt, {
                    id: args.sourceId,
                    lastScrapedAt: Date.now(),
                    resolvedUrl: parsed.resolvedUrl,
                });
            }

            return {
                title: parsed.title,
                items: parsed.items,
                resolvedUrl: parsed.resolvedUrl,
                attemptedUrls: parsed.attemptedUrls,
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[RSS] Failed to parse ${args.url}:`, message);
            if (args.sourceId) {
                await ctx.runMutation(api.rss.recordFailure, {
                    id: args.sourceId,
                    attemptedAt: Date.now(),
                    error: message,
                });
            }
            return { error: message };
        }
    },
});

export const addVerifiedSource = action({
    args: {
        name: v.string(),
        url: v.string(),
        category: v.string(),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{
        id: Id<"rss_sources">;
        url: string;
        resolvedUrl: string | null;
        attemptedUrls: string[];
        title: string;
    }> => {
        const parsed = await parseFeedSmart(args.url);
        if (!parsed.ok) {
            throw new Error(`Could not find a valid RSS/Atom feed for this URL. ${parsed.error}`);
        }

        const canonicalUrl = parsed.resolvedUrl || args.url;
        const resolvedUrl = canonicalUrl !== args.url ? canonicalUrl : null;

        const id: Id<"rss_sources"> = await ctx.runMutation(api.rss.addVerified, {
            name: args.name,
            originalUrl: args.url,
            url: canonicalUrl,
            resolvedUrl,
            category: args.category,
        });

        return {
            id,
            url: canonicalUrl,
            resolvedUrl,
            attemptedUrls: parsed.attemptedUrls,
            title: parsed.title,
        };
    },
});

export const triggerScoutWithData = action({
    args: {},
    handler: async (ctx) => {
        console.log("🚀 Starting Data-Injected Scout Mission...");
        const nowMs = Date.now();
        const cutoffMs = nowMs - 2 * 24 * 60 * 60 * 1000;

        // 1. Get active sources
        const sources = (await ctx.runQuery(api.rss.list)) as Array<{
            _id: Id<"rss_sources">;
            name: string;
            url: string;
            category: string;
            active: boolean;
        }>;
        const activeSources = sources.filter((s) => s.active);

        const xSources = (await ctx.runQuery(api.x.list)) as Array<{
            _id: Id<"x_sources">;
            name: string;
            username: string;
            category: string;
            active: boolean;
        }>;
        const activeXSources = xSources.filter((s) => s.active);

        if (activeSources.length === 0 && activeXSources.length === 0) {
            throw new Error("No active RSS or X sources found to scan.");
        }

        let compiledIntel = "# RSS INTEL FEED\n\n";
        let rssOk = 0;
        let rssErr = 0;
        let rssLinkCount = 0;
        let rssStaleSkipped = 0;
        const discoveredLinks = new Map<
            string,
            { url: string; title: string; summary?: string; publishedAt?: number; tags?: string[] }
        >();

        // 2. Fetch each source
        for (const source of activeSources) {
            const displayName = normalizeSourceName(source.name, source.category);
            try {
                const result = (await ctx.runAction(api.rssActions.parseFeed, {
                    url: source.url,
                    sourceId: source._id
                })) as {
                    title?: string;
                    items?: FeedItem[];
                    resolvedUrl?: string;
                    attemptedUrls?: string[];
                    error?: string;
                };

                if (result.items) {
                    rssOk += 1;
                    const freshItems = result.items
                        .map((item) => ({ item, ts: parseItemTimestampMs(item) }))
                        .filter(({ item, ts }) => !!item.link && ts !== null && ts >= cutoffMs)
                        .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
                        .map(({ item, ts }) => ({ item, ts: ts ?? undefined }))
                        .slice(0, 5);

                    if (freshItems.length === 0) {
                        rssStaleSkipped += 1;
                        compiledIntel += `## SOURCE: ${displayName} — NO RECENT ITEMS\n`;
                        compiledIntel += `- Skipped: no items published in the last 2 days.\n\n`;
                    } else {
                        compiledIntel += `## SOURCE: ${displayName}\n`;
                        for (const { item, ts } of freshItems) {
                            rssLinkCount += 1;
                            const date = (item.isoDate || item.pubDate || "").trim();
                            compiledIntel += `- **${item.title}**\n  URL: ${item.link}\n  Date: ${date}\n  Snippet: ${item.contentSnippet}\n\n`;

                            const url = item.link.trim();
                            if (url && !discoveredLinks.has(url)) {
                                discoveredLinks.set(url, {
                                    url,
                                    title: item.title || "Untitled",
                                    summary: item.contentSnippet || undefined,
                                    publishedAt: typeof ts === "number" ? ts : undefined,
                                    tags: ["rss", source.category, displayName],
                                });
                            }
                        }
                    }
                    if (result.resolvedUrl && result.resolvedUrl !== source.url) {
                        compiledIntel += `  (Resolved feed URL: ${result.resolvedUrl})\n\n`;
                    }
                } else if (result.error) {
                    rssErr += 1;
                    compiledIntel += `## SOURCE: ${displayName} — ERROR\n`;
                    compiledIntel += `- Feed URL: ${source.url}\n`;
                    compiledIntel += `- ${result.error}\n`;
                    if (Array.isArray(result.attemptedUrls) && result.attemptedUrls.length > 0) {
                        compiledIntel += `- Attempted: ${result.attemptedUrls.join(", ")}\n`;
                    }
                    compiledIntel += `\n`;
                }
            } catch (e) {
                console.error(`Failed to include ${displayName} in mission list:`, e);
                rssErr += 1;
            }
        }

        if (activeXSources.length > 0) {
            compiledIntel += "\n# X INTEL FEED\n\n";
            for (const source of activeXSources) {
                try {
                    const result = (await ctx.runAction(api.xActions.fetchUserTweets, {
                        usernameOrUrl: source.username,
                        sourceId: source._id,
                    })) as {
                        username?: string;
                        items?: Array<{ id: string; text: string; createdAt?: string; url: string }>;
                        error?: string;
                    };

                    if (result.items) {
                        compiledIntel += `## SOURCE: ${source.name} (@${source.username}) (${source.category})\n`;
                        result.items.forEach((item) => {
                            compiledIntel += `- ${item.text}\n  URL: ${item.url}\n  Date: ${item.createdAt ?? ""}\n\n`;
                        });
                    } else if (result.error) {
                        compiledIntel += `## SOURCE: ${source.name} (@${source.username}) (${source.category}) — ERROR\n`;
                        compiledIntel += `- ${result.error}\n\n`;
                    }
                } catch (e) {
                    console.error(`Failed to include X source ${source.name} in mission list:`, e);
                }
            }
        }

        // 3. Create Task with Data Injected
        const scanSummary = `Scan summary: RSS ${rssOk} ok / ${rssErr} failed. Freshness: skipped ${rssStaleSkipped} sources with no items in last 2 days. Links: ${rssLinkCount}.`;
        const description = `This is a high-priority research mission. 
I have pre-fetched data from our active RSS streams below. 
${scanSummary}

YOUR INSTRUCTIONS:
1. Analyze the provided Intel Feed.
2. Identify the top 3-7 most impactful AI shifts.
3. Save them to our database as structured briefs.
4. Output your report in the standard Scout JSON format.

---
${compiledIntel}`;

        const taskId = (await ctx.runMutation(api.tasks.create, {
            title: `Scout Scan: ${new Date().toLocaleDateString()}`,
            description: description,
            priority: "high"
        })) as Id<"tasks">;

        // 4. Insert all fresh feed items as Pending links for review (not just Curie's top picks).
        // This ensures the Scout dashboard reflects everything fetched in the Intel Feed.
        for (const link of discoveredLinks.values()) {
            try {
                await ctx.runMutation(api.links.addLink, {
                    url: link.url,
                    title: link.title,
                    summary: link.summary,
                    agent: "RSS",
                    taskId,
                    tags: link.tags,
                    publishedAt: link.publishedAt,
                });
            } catch (e) {
                console.error("[SCOUT RSS->LINKS] Failed to save pending link:", link.url, e);
            }
        }

        console.log(`✅ Mission Triggered with Data! Task ID: ${taskId}`);
        return taskId;
    },
});
