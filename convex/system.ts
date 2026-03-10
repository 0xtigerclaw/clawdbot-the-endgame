import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getStatus = query({
    args: {},
    handler: async (ctx) => {
        const systemStatus = await ctx.db.query("system_status").unique();
        if (!systemStatus) {
            return { status: "online", updatedAt: Date.now() };
        }
        return systemStatus;
    },
});

export const toggleStatus = mutation({
    args: {},
    handler: async (ctx) => {
        const systemStatus = await ctx.db.query("system_status").unique();
        if (!systemStatus) {
            await ctx.db.insert("system_status", {
                status: "offline",
                updatedAt: Date.now(),
            });
            return "offline";
        }

        const nextStatus = systemStatus.status === "online" ? "offline" : "online";
        await ctx.db.patch(systemStatus._id, {
            status: nextStatus,
            updatedAt: Date.now(),
        });
        return nextStatus;
    },
});
