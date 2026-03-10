import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("x_sources").collect();
    },
});

export const add = mutation({
    args: {
        name: v.string(),
        username: v.string(),
        category: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("x_sources", {
            name: args.name,
            username: args.username,
            category: args.category,
            active: true,
            errorCount: 0,
            lastError: null,
            lastErrorAt: null,
        });
    },
});

export const updateLastFetchedAt = mutation({
    args: {
        id: v.id("x_sources"),
        lastFetchedAt: v.number(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, {
            lastFetchedAt: args.lastFetchedAt,
            lastAttemptedAt: args.lastFetchedAt,
            errorCount: 0,
            lastError: null,
            lastErrorAt: null,
        });
    },
});

export const recordFailure = mutation({
    args: {
        id: v.id("x_sources"),
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
    args: { id: v.id("x_sources") },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.id);
    },
});

export const toggleActive = mutation({
    args: { id: v.id("x_sources"), active: v.boolean() },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, {
            active: args.active,
        });
    },
});

