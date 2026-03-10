import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

function normalizeUserUrl(raw: string): string {
    const trimmed = (raw || "").trim();
    const unwrapped = trimmed.replace(/^<(.+)>$/, "$1").replace(/^["'](.+)["']$/, "$1").trim();
    if (!unwrapped) throw new Error("URL is required");

    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(unwrapped) ? unwrapped : `https://${unwrapped}`;

    let parsed: URL;
    try {
        parsed = new URL(withScheme);
    } catch {
        throw new Error(`Invalid URL: ${raw}`);
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
    }

    // Strip tracking-ish fragments + trailing punctuation artifacts that often come from copy/paste.
    parsed.hash = "";
    const normalized = parsed.toString().replace(/[)\].,;]+$/, "");
    return normalized;
}

export const addLink = mutation({
    args: {
        url: v.string(),
        title: v.optional(v.string()),
        summary: v.optional(v.string()),
        agent: v.string(),
        taskId: v.id("tasks"),
        tags: v.optional(v.array(v.string())),
        qualityScore: v.optional(v.number()),
        publishedAt: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const url = normalizeUserUrl(args.url);
        const existing = await ctx.db.query("scouted_links")
            .withIndex("by_url", (q) => q.eq("url", url))
            .first();

        if (existing) {
            // If already approved, rejected, or ignored, don't resurface it
            if (existing.status === "approved" || existing.status === "rejected" || existing.status === "ignored") {
                console.log(`[LINKS] Skipping already processed link (${existing.status}): ${url}`);
                return existing._id;
            }

            // If it's already pending, we might want to update some fields but maybe keep the original createdAt or just return
            console.log(`[LINKS] Link already pending: ${url}`);
            await ctx.db.patch(existing._id, {
                summary: args.summary || existing.summary,
                title: args.title || existing.title,
                qualityScore: args.qualityScore || existing.qualityScore,
                publishedAt: args.publishedAt ?? existing.publishedAt,
                // We DON'T bump createdAt here to avoid spamming the top of the feed with the same thing
            });
            return existing._id;
        }

        return await ctx.db.insert("scouted_links", {
            url,
            title: args.title,
            summary: args.summary,
            agent: args.agent,
            taskId: args.taskId,
            tags: args.tags,
            qualityScore: args.qualityScore,
            publishedAt: args.publishedAt,
            status: "pending", // Default status for new findings
            createdAt: Date.now(),
        });
    },
});


export const addManualLink = mutation({
    args: { url: v.string() },
    handler: async (ctx, args) => {
        const url = normalizeUserUrl(args.url);
        console.log(`[LINKS] Adding manual link: ${url}`);
        const existing = await ctx.db.query("scouted_links")
            .withIndex("by_url", (q) => q.eq("url", url))
            .first();

        if (existing) {
            // Manual drops should always resurface, even if previously reviewed.
            if (existing.status !== "pending") {
                await ctx.db.patch(existing._id, {
                    status: "pending",
                    agent: "User",
                    feedback: undefined,
                    createdAt: Date.now(),
                });
            }
            return existing._id;
        }

        return await ctx.db.insert("scouted_links", {
            url,
            agent: "User",
            status: "pending",
            createdAt: Date.now(),
        });
    },
});


export const listByTask = query({
    args: { taskId: v.id("tasks") },
    handler: async (ctx, args) => {
        return await ctx.db.query("scouted_links")
            .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
            .collect();
    },
});

export const listByStatus = query({
    args: { status: v.optional(v.string()) }, // e.g. "pending"
    handler: async (ctx, args) => {
        const status = args.status || "pending";
        return await ctx.db.query("scouted_links")
            .withIndex("by_status", (q) => q.eq("status", status))
            .order("desc")
            .collect();
    },
});

export const reviewLink = mutation({
    args: {
        id: v.id("scouted_links"),
        status: v.string(), // "approved", "rejected", "pending"
        feedback: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, {
            status: args.status,
            feedback: args.feedback,
        });

        // AUTO-TRIGGER: If approved, create a task for Ogilvy
        if (args.status === "approved") {
            const link = await ctx.db.get(args.id);
            if (link) {
                console.log(`[LINKS] Creating task for approved link: ${link.title}`);
                const newTaskId = await ctx.db.insert("tasks", {
                    title: `Draft Content: ${link.title || link.url}`,
                    description: `Source: ${link.url}\n\nSummary: ${link.summary}\n\nReviewer Feedback: ${args.feedback || "None"}\n\nTask: Use this intel to write a high-quality post.`,
                    priority: "high",
                    status: "assigned",
                    // Full Content Pipeline: Writer -> Editor -> Visuals
                    workflow: ["Ogilvy", "Carnegie", "Ive"],
                    assignedTo: "Ogilvy",
                    currentStep: 0,
                });
                console.log(`[LINKS] Created task ID: ${newTaskId}`);
                await ctx.db.patch(args.id, { taskId: newTaskId });
            } else {
                console.error(`[LINKS] Link not found for ID: ${args.id}`);
            }
        } else {
            console.log(`[LINKS] Link status updated to ${args.status}, no task created.`);
        }
    },
});

export const clearAllLinks = mutation({
    args: { status: v.string() },
    handler: async (ctx, args) => {
        const links = await ctx.db.query("scouted_links")
            .withIndex("by_status", (q) => q.eq("status", args.status))
            .collect();

        console.log(`[LINKS] Clearing ${links.length} links with status: ${args.status}`);

        for (const link of links) {
            await ctx.db.patch(link._id, { status: "ignored" });
        }
    },
});
