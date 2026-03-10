import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("rss_sources").collect();
    },
});

export const add = mutation({
    args: {
        name: v.string(),
        url: v.string(),
        category: v.string(),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("rss_sources")
            .withIndex("by_url", (q) => q.eq("url", args.url))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                name: args.name,
                category: args.category,
                active: true,
            });
            return existing._id;
        }

        return await ctx.db.insert("rss_sources", {
            name: args.name,
            url: args.url,
            resolvedUrl: null,
            category: args.category,
            active: true,
            errorCount: 0,
            lastError: null,
            lastErrorAt: null,
        });
    },
});

export const addVerified = mutation({
    args: {
        name: v.string(),
        originalUrl: v.string(),
        url: v.string(),
        resolvedUrl: v.union(v.null(), v.string()),
        category: v.string(),
    },
    handler: async (ctx, args) => {
        const existingByUrl = await ctx.db
            .query("rss_sources")
            .withIndex("by_url", (q) => q.eq("url", args.url))
            .first();

        if (existingByUrl) {
            await ctx.db.patch(existingByUrl._id, {
                name: args.name,
                category: args.category,
                active: true,
                originalUrl: existingByUrl.originalUrl ?? args.originalUrl,
                resolvedUrl: args.resolvedUrl,
            });
            return existingByUrl._id;
        }

        const existingByOriginal = await ctx.db
            .query("rss_sources")
            .withIndex("by_originalUrl", (q) => q.eq("originalUrl", args.originalUrl))
            .first();

        if (existingByOriginal) {
            await ctx.db.patch(existingByOriginal._id, {
                name: args.name,
                category: args.category,
                active: true,
                url: args.url,
                resolvedUrl: args.resolvedUrl,
            });
            return existingByOriginal._id;
        }

        return await ctx.db.insert("rss_sources", {
            name: args.name,
            originalUrl: args.originalUrl,
            url: args.url,
            resolvedUrl: args.resolvedUrl,
            category: args.category,
            active: true,
            errorCount: 0,
            lastError: null,
            lastErrorAt: null,
        });
    },
});

export const update = mutation({
    args: {
        id: v.id("rss_sources"),
        name: v.optional(v.string()),
        originalUrl: v.optional(v.string()),
        url: v.optional(v.string()),
        resolvedUrl: v.optional(v.union(v.null(), v.string())),
        category: v.optional(v.string()),
        active: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const { id, ...updates } = args;
        await ctx.db.patch(id, updates);
    },
});

export const updateLastScrapedAt = mutation({
    args: {
        id: v.id("rss_sources"),
        lastScrapedAt: v.number(),
        resolvedUrl: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const patch: Record<string, unknown> = {
            lastScrapedAt: args.lastScrapedAt,
            lastAttemptedAt: args.lastScrapedAt,
            errorCount: 0,
            lastError: null,
            lastErrorAt: null,
        };
        if (args.resolvedUrl) {
            patch.resolvedUrl = args.resolvedUrl;
            const existing = await ctx.db.get(args.id);
            if (existing && existing.url !== args.resolvedUrl) {
                if (!existing.originalUrl) patch.originalUrl = existing.url;
                patch.url = args.resolvedUrl;
            }
        }
        await ctx.db.patch(args.id, patch);
    },
});

export const recordFailure = mutation({
    args: {
        id: v.id("rss_sources"),
        attemptedAt: v.number(),
        error: v.string(),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db.get(args.id);
        const nextErrorCount = (existing?.errorCount ?? 0) + 1;
        await ctx.db.patch(args.id, {
            lastAttemptedAt: args.attemptedAt,
            errorCount: nextErrorCount,
            lastError: args.error,
            lastErrorAt: args.attemptedAt,
        });
    },
});

export const remove = mutation({
    args: { id: v.id("rss_sources") },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.id);
    },
});

export const toggleActive = mutation({
    args: { id: v.id("rss_sources"), active: v.boolean() },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, {
            active: args.active,
        });
    },
});
