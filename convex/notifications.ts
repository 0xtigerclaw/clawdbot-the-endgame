import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Create a new notification
export const create = mutation({
    args: {
        agentName: v.string(),
        type: v.string(),
        content: v.string(),
        taskId: v.optional(v.id("tasks")),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("notifications", {
            agentName: args.agentName,
            type: args.type,
            content: args.content,
            taskId: args.taskId,
            delivered: false,
            createdAt: Date.now(),
        });
    },
});

// Get undelivered notifications for an agent
export const getUndelivered = query({
    args: { agentName: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("notifications")
            .filter((q) =>
                q.and(
                    q.eq(q.field("agentName"), args.agentName),
                    q.eq(q.field("delivered"), false)
                )
            )
            .order("asc")
            .collect();
    },
});

// Mark notification as delivered
export const markDelivered = mutation({
    args: { notificationId: v.id("notifications") },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.notificationId, { delivered: true });
    },
});

// Mark all notifications for an agent as delivered
export const markAllDelivered = mutation({
    args: { agentName: v.string() },
    handler: async (ctx, args) => {
        const notifications = await ctx.db
            .query("notifications")
            .filter((q) =>
                q.and(
                    q.eq(q.field("agentName"), args.agentName),
                    q.eq(q.field("delivered"), false)
                )
            )
            .collect();

        for (const notification of notifications) {
            await ctx.db.patch(notification._id, { delivered: true });
        }

        return notifications.length;
    },
});
