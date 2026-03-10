import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Valid agent names for reopening
const VALID_AGENTS = ["Tigerclaw", "Tesla", "Torvalds", "Curie", "Porter", "Ogilvy", "Kotler", "Ive", "Carnegie", "Dewey"];

// Get all messages for a task
export const list = query({
    args: { taskId: v.id("tasks") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("messages")
            .filter((q) => q.eq(q.field("taskId"), args.taskId))
            .order("asc")
            .collect();
    },
});

// Add a new message to a task
export const add = mutation({
    args: {
        taskId: v.id("tasks"),
        agentName: v.string(),
        content: v.string(),
    },
    handler: async (ctx, args) => {
        // Get the task to check its status
        const task = await ctx.db.get(args.taskId);

        // Create the message
        const messageId = await ctx.db.insert("messages", {
            taskId: args.taskId,
            agentName: args.agentName,
            content: args.content,
            timestamp: Date.now(),
        });

        // Check for @mentions
        const mentionRegex = /@(\w+)/gi;
        let match;
        while ((match = mentionRegex.exec(args.content)) !== null) {
            const mentionedName = match[1];
            // Find matching agent (case-insensitive)
            const mentionedAgent = VALID_AGENTS.find(
                a => a.toLowerCase() === mentionedName.toLowerCase()
            );

            if (mentionedAgent) {
                // Create notification
                await ctx.db.insert("notifications", {
                    agentName: mentionedAgent,
                    type: "mention",
                    content: `${args.agentName} mentioned you: "${args.content.substring(0, 100)}..."`,
                    taskId: args.taskId,
                    delivered: false,
                    createdAt: Date.now(),
                });

                // If task is DONE and user mentions an agent, reopen and reassign
                if (task && task.status === "done" && args.agentName !== "Tigerclaw") {
                    await ctx.db.patch(args.taskId, {
                        status: "assigned",
                        assignedTo: mentionedAgent,
                        workflow: [mentionedAgent, "Tigerclaw"],
                        currentStep: 0,
                        feedback: `Reopened by user: "${args.content}"`,
                    });

                    // Create assignment notification
                    await ctx.db.insert("notifications", {
                        agentName: mentionedAgent,
                        type: "assignment",
                        content: `Task reopened: "${task.title}"`,
                        taskId: args.taskId,
                        delivered: false,
                        createdAt: Date.now(),
                    });
                }
            }
        }

        // Special handling for "Next Step" clicks (routed via Gateway)
        if (args.content.startsWith("[Next Step]")) {
            await ctx.db.patch(args.taskId, {
                status: "inbox", // Send back to inbox for re-routing
                assignedTo: "Tigerclaw",
                feedback: args.content,
                output: (await ctx.db.get(args.taskId))?.output // Preserve output
            });
        }

        // AUTO-DETECT follow-up requests on done tasks (accepts any non-system agent)
        console.log(`[MESSAGES] Checking follow-up: task.status=${task?.status}, agentName=${args.agentName}, content=${args.content.substring(0, 50)}...`);

        if (task && task.status === "done" && args.agentName !== "Tigerclaw") {
            const contentLower = args.content.toLowerCase();
            const isFollowUpRequest =
                contentLower.includes("repurpose") ||
                contentLower.includes("rewrite") ||
                contentLower.includes("make this") ||
                contentLower.includes("convert") ||
                contentLower.includes("turn this into") ||
                contentLower.includes("create a") ||
                contentLower.includes("write a") ||
                contentLower.includes("linkedin") ||
                contentLower.includes("twitter") ||
                contentLower.includes("x post") ||
                contentLower.includes("tweet") ||
                contentLower.includes("email") ||
                contentLower.includes("thread") ||
                contentLower.includes("summary") ||
                contentLower.includes("talk about") ||
                contentLower.includes("mention") ||
                contentLower.includes("include") ||
                contentLower.includes("add") ||
                contentLower.includes("change") ||
                contentLower.includes("update") ||
                contentLower.includes("fix") ||
                contentLower.includes("remove") ||
                contentLower.includes("delete");

            console.log(`[MESSAGES] isFollowUpRequest=${isFollowUpRequest}`);

            if (isFollowUpRequest) {
                // Determine which agent to assign based on content
                let targetAgent = "Ogilvy"; // Default

                // Content-based routing
                if (contentLower.includes("linkedin") || contentLower.includes("social")) targetAgent = "Kotler";
                else if (contentLower.includes("twitter") || contentLower.includes("thread") || contentLower.includes("x post") || contentLower.includes("tweet")) targetAgent = "Kotler";
                else if (contentLower.includes("email")) targetAgent = "Carnegie";
                else if (contentLower.includes("code") || contentLower.includes("implement") || contentLower.includes("function") || contentLower.includes("api")) targetAgent = "Torvalds";
                else if (contentLower.includes("design") || contentLower.includes("visual") || contentLower.includes("color") || contentLower.includes("style")) targetAgent = "Ive";
                else if (contentLower.includes("research") || contentLower.includes("find") || contentLower.includes("search")) targetAgent = "Curie";

                // If a specific agent was mentioned in the text (even without @), try to route to them
                if (contentLower.includes("ogilvy")) targetAgent = "Ogilvy";
                if (contentLower.includes("curie")) targetAgent = "Curie";
                if (contentLower.includes("torvalds")) targetAgent = "Torvalds";
                if (contentLower.includes("ive")) targetAgent = "Ive";
                if (contentLower.includes("kotler")) targetAgent = "Kotler";
                if (contentLower.includes("tesla")) targetAgent = "Tesla";
                if (contentLower.includes("carnegie")) targetAgent = "Carnegie";

                console.log(`[MESSAGES] Reopening task for follow-up. Assigning to: ${targetAgent}`);

                // Reopen task with context preserved
                await ctx.db.patch(args.taskId, {
                    status: "assigned",
                    assignedTo: targetAgent,
                    workflow: [targetAgent, "Tigerclaw"],
                    currentStep: 0,
                    feedback: `Follow-up: "${args.content}" (Previous output preserved)`,
                });

                // Notify the agent
                await ctx.db.insert("notifications", {
                    agentName: targetAgent,
                    type: "assignment",
                    content: `Follow-up task: "${args.content}" on "${task.title}"`,
                    taskId: args.taskId,
                    delivered: false,
                    createdAt: Date.now(),
                });
            }
        }

        return messageId;
    },
});

