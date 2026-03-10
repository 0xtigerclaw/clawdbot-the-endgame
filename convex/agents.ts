import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("agents").collect();
    },
});

export const recentActivity = query({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const limit = args.limit || 50;
        return await ctx.db.query("activity")
            .order("desc")
            .take(limit);
    },
});

export const updateStatus = mutation({
    args: {
        id: v.id("agents"),
        status: v.string(),
        sessionId: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, {
            status: args.status,
            lastActive: Date.now(),
            sessionId: args.sessionId
        });
    },
});

export const logActivity = mutation({
    args: {
        agentName: v.string(),
        type: v.string(),
        content: v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("activity", {
            agentName: args.agentName,
            type: args.type,
            content: args.content,
            timestamp: Date.now(),
        });
    },
});

// Seed the squad if empty
export const initSquad = mutation({
    args: {},
    handler: async (ctx) => {
        const existing = await ctx.db.query("agents").collect();
        if (existing.length > 0) return;

        const squad = [
            { name: "Tigerclaw", role: "Squad Lead", status: "sleeping" },
            { name: "Tesla", role: "Analyst", status: "sleeping" },
            { name: "Torvalds", role: "Developer", status: "sleeping" },
            { name: "Curie", role: "Scout", status: "sleeping" },
            { name: "Porter", role: "SEO Expert", status: "sleeping" },
            { name: "Ogilvy", role: "Writer", status: "sleeping" },
            { name: "Kotler", role: "Marketing Guru", status: "sleeping" },
            { name: "Ive", role: "Visual", status: "sleeping" },
            { name: "Carnegie", role: "Editor", status: "sleeping" },
            { name: "Dewey", role: "Knowledge Manager", status: "sleeping" },
            { name: "Nolan", role: "Head of Creatives", status: "sleeping" },
        ];

        for (const agent of squad) {
            await ctx.db.insert("agents", {
                ...agent,
                lastActive: Date.now(),
            });
        }
    },
});

export const resetSquad = mutation({
    args: {},
    handler: async (ctx) => {
        const existing = await ctx.db.query("agents").collect();
        for (const agent of existing) {
            await ctx.db.delete(agent._id);
        }

        const squad = [
            { name: "Tigerclaw", role: "Squad Lead", status: "sleeping" },
            { name: "Tesla", role: "Analyst", status: "sleeping" },
            { name: "Torvalds", role: "Developer", status: "sleeping" },
            { name: "Curie", role: "Scout", status: "sleeping" },
            { name: "Porter", role: "SEO Expert", status: "sleeping" },
            { name: "Ogilvy", role: "Writer", status: "sleeping" },
            { name: "Kotler", role: "Marketing Guru", status: "sleeping" },
            { name: "Ive", role: "Visual", status: "sleeping" },
            { name: "Carnegie", role: "Editor", status: "sleeping" },
            { name: "Dewey", role: "Knowledge Manager", status: "sleeping" },
            { name: "Nolan", role: "Head of Creatives", status: "sleeping" },
        ];

        for (const agent of squad) {
            await ctx.db.insert("agents", {
                ...agent,
                lastActive: Date.now(),
            });
        }
    },
});
