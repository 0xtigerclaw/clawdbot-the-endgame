import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

// --- Queries & Mutations ---

export const list = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("skills").order("desc").collect();
    },
});

export const get = query({
    args: { id: v.id("skills") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
    },
});

export const getResources = query({
    args: { skillId: v.id("skills") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("resources")
            .withIndex("by_skill", (q) => q.eq("skillId", args.skillId))
            .collect();
    },
});

export const create = mutation({
    args: { name: v.string(), description: v.optional(v.string()) },
    handler: async (ctx, args) => {
        return await ctx.db.insert("skills", {
            name: args.name,
            description: args.description,
            updatedAt: Date.now(),
        });
    },
});

export const updateGeneratedMd = internalMutation({
    args: { id: v.id("skills"), md: v.string() },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, { generatedMd: args.md, updatedAt: Date.now() });
    },
});

export const addResource = mutation({
    args: {
        skillId: v.id("skills"),
        type: v.string(),
        title: v.string(),
        storageId: v.optional(v.string()), // For uploaded files
        url: v.optional(v.string()),       // For links
        textContent: v.optional(v.string()), // For text or notes
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("resources", {
            skillId: args.skillId,
            type: args.type,
            title: args.title,
            storageId: args.storageId,
            url: args.url,
            textContent: args.textContent,
            createdAt: Date.now(),
        });
    },
});

export const deleteResource = mutation({
    args: { id: v.id("resources") },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.id);
    },
});
