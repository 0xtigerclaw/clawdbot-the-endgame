import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { formatFinalReport } from "./lib/formatting";

function normalizeWhitespace(input: string): string {
    return (input || "").replace(/\s+/g, " ").trim();
}

function extractJsonFromReport(report: string): Record<string, unknown> | null {
    try {
        const jsonMatch =
            report.match(/```json\n([\s\S]*?)\n```/) ||
            report.match(/```\n([\s\S]*?)\n```/) ||
            report.match(/({[\s\S]*})/);
        if (!jsonMatch) return null;
        const jsonStr = (jsonMatch[1] || jsonMatch[0]).trim();
        const parsed = JSON.parse(jsonStr);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
        return null;
    } catch {
        return null;
    }
}

function truncateChars(input: string, maxChars: number): string {
    const cleaned = normalizeWhitespace(input);
    if (cleaned.length <= maxChars) return cleaned;
    const slice = cleaned.slice(0, maxChars);
    const lastSpace = slice.lastIndexOf(" ");
    return (lastSpace > 18 ? slice.slice(0, lastSpace) : slice).trimEnd() + "…";
}

function normalizeOverlayHookCandidate(input: string): string {
    const cleaned = normalizeWhitespace(
        input
            .replace(/https?:\/\/\S+/g, "")
            .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
            .replace(/[“”]/g, '"')
            .replace(/[‘’]/g, "'"),
    );
    const trimmed = cleaned.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "").trim();
    return truncateChars(trimmed, 140);
}

type OverlayHookCandidate = {
    id: string;
    text: string;
    source: "editor" | "writer" | "parsed" | "fallback";
};

function makeHookId(text: string, index: number): string {
    const slug = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 28);
    const tail = slug || `hook-${index}`;
    return `hook_${index}_${tail}`;
}

function collectOverlayHookCandidates(writerReport?: string, editorReport?: string, taskDescription?: string): OverlayHookCandidate[] {
    const banned = new Set([
        "ogilvy", "carnegie", "ive", "tigerclaw", "curie", "kotler", "porter", "tesla", "torvalds", "nolan",
        "writer", "editor", "designer", "recommendations", "mission", "report",
    ]);

    const rawCandidates: Array<{ text: string; source: OverlayHookCandidate["source"]; preferredId?: string }> = [];

    const add = (value: unknown, source: OverlayHookCandidate["source"]) => {
        if (typeof value !== "string") return;
        const normalized = normalizeOverlayHookCandidate(value);
        if (!normalized) return;
        const key = normalized.toLowerCase();
        if (banned.has(key)) return;
        rawCandidates.push({ text: normalized, source });
    };

    const addWithId = (value: unknown, source: OverlayHookCandidate["source"], preferredId?: unknown) => {
        if (typeof value !== "string") return;
        const normalized = normalizeOverlayHookCandidate(value);
        if (!normalized) return;
        const key = normalized.toLowerCase();
        if (banned.has(key)) return;
        rawCandidates.push({
            text: normalized,
            source,
            preferredId: typeof preferredId === "string" ? normalizeWhitespace(preferredId) : undefined,
        });
    };

    const addFromExplicitHookField = (payload: Record<string, unknown> | null, source: OverlayHookCandidate["source"]) => {
        if (!payload) return;
        const explicit = payload["overlay_hook_candidates"];
        if (!Array.isArray(explicit)) return;
        for (const item of explicit) {
            if (typeof item === "string") {
                add(item, source);
                continue;
            }
            if (item && typeof item === "object") {
                const entry = item as Record<string, unknown>;
                addWithId(entry["text"], source, entry["id"]);
            }
        }
    };

    const addFromPlainText = (text?: string) => {
        if (!text) return;
        const lines = text.split(/\r?\n/).slice(0, 200);

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;

            // Bold-only line (common for hooks).
            const bold = line.match(/^\*\*(.+?)\*\*$/);
            if (bold?.[1]) {
                add(bold[1], "parsed");
                continue;
            }

            // Bullet/numbered candidates.
            const bullet = line.match(/^(?:[-*]|\d+\.)\s+(.{3,160})$/);
            if (bullet?.[1]) {
                add(bullet[1], "parsed");
                continue;
            }

            // "Hook:" / "Overlay:" style.
            const labeled = line.match(/^(hook|overlay|title)\s*:\s*(.{3,160})$/i);
            if (labeled?.[2]) {
                add(labeled[2], "parsed");
                continue;
            }
        }
    };

    const writerJson = writerReport ? extractJsonFromReport(writerReport) : null;
    const editorJson = editorReport ? extractJsonFromReport(editorReport) : null;

    // Prefer explicit hook contracts when present.
    addFromExplicitHookField(editorJson, "editor");
    addFromExplicitHookField(writerJson, "writer");

    // Editor first (usually sharper): finalized_drafts[0].hook_variants + quotable_line
    if (editorJson) {
        const quotable = (editorJson as Record<string, unknown>)["quotable_line"];
        add(quotable, "editor");

        const finalized = (editorJson as Record<string, unknown>)["finalized_drafts"];
        if (Array.isArray(finalized) && finalized.length > 0) {
            const first = finalized[0];
            const hv =
                first && typeof first === "object"
                    ? (first as Record<string, unknown>)["hook_variants"]
                    : undefined;
            if (Array.isArray(hv)) hv.forEach((value) => add(value, "editor"));
            else if (hv && typeof hv === "object") Object.values(hv).forEach((value) => add(value, "editor"));
        }
    }

    // Writer: drafts[0].hook_variants[]
    const drafts = writerJson?.drafts;
    if (Array.isArray(drafts) && drafts.length > 0 && drafts[0] && typeof drafts[0] === "object") {
        const firstDraft = drafts[0] as Record<string, unknown>;
        const hv = firstDraft["hook_variants"];
        if (Array.isArray(hv)) hv.forEach((value) => add(value, "writer"));
    }

    // Plain-text fallback: pull likely hook lines from the reports even if JSON parsing fails.
    addFromPlainText(writerReport);
    addFromPlainText(editorReport);

    // Fallback: first RSS item title in the description
    if (taskDescription) {
        const m = taskDescription.match(/-\s*\*\*(.+?)\*\*\s*\n\s*URL:\s*https?:\/\/\S+/i);
        if (m?.[1]) add(m[1], "fallback");
    }

    const seen = new Set<string>();
    const candidates: OverlayHookCandidate[] = [];
    for (const item of rawCandidates) {
        const key = item.text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const nextIndex = candidates.length + 1;
        candidates.push({
            id: item.preferredId || makeHookId(item.text, nextIndex),
            text: item.text,
            source: item.source,
        });
        if (candidates.length >= 3) break;
    }

    return candidates;
}

export const list = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("tasks").collect();
    },
});

export const getLatestByTitle = query({
    args: { titlePattern: v.string() },
    handler: async (ctx, args) => {
        const tasks = await ctx.db.query("tasks")
            .order("desc")
            .collect();
        return tasks.find(t => t.title.includes(args.titlePattern));
    },
});

// Get a single task by ID
export const get = query({
    args: { id: v.id("tasks") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
    },
});

export const getMany = query({
    args: { ids: v.array(v.id("tasks")) },
    handler: async (ctx, args) => {
        const MAX_IDS = 50;
        const uniqueIds = Array.from(new Set(args.ids.map((id) => String(id))));
        const idsToFetch = uniqueIds.slice(0, MAX_IDS) as Array<Id<"tasks">>;

        const out: Array<{
            _id: string;
            title: string;
            status: string;
            selectedOverlayHook?: string;
            selectedOverlayHookId?: string;
        }> = [];

        for (const id of idsToFetch) {
            const task = await ctx.db.get(id);
            if (!task) continue;
            out.push({
                _id: task._id,
                title: task.title,
                status: task.status,
                ...(task.selectedOverlayHook ? { selectedOverlayHook: task.selectedOverlayHook } : {}),
                ...(task.selectedOverlayHookId ? { selectedOverlayHookId: task.selectedOverlayHookId } : {}),
            });
        }
        return out;
    },
});

export const create = mutation({
    args: {
        title: v.string(),
        description: v.optional(v.string()),
        priority: v.optional(v.string()),
        workflow: v.optional(v.array(v.union(v.string(), v.array(v.string())))) // User predefined workflow
    },
    handler: async (ctx, args) => {
        const hasWorkflow = args.workflow && args.workflow.length > 0;
        const status = hasWorkflow ? "assigned" : "inbox";

        let assignedTo: string | string[] | undefined = undefined;

        if (hasWorkflow) {
            const firstStep = args.workflow![0];
            if (Array.isArray(firstStep)) {
                assignedTo = firstStep; // Parallel stage
            } else {
                assignedTo = firstStep as string; // Single agent
            }
        }

        return await ctx.db.insert("tasks", {
            title: args.title,
            description: args.description,
            priority: args.priority || "medium",
            status: status,
            workflow: args.workflow,
            assignedTo: assignedTo,
            currentStep: 0,
        });
    },
});

export const listPending = query({
    args: { agentName: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const tasks = await ctx.db.query("tasks").collect();
        return tasks.filter(t =>
            (t.status === "assigned" || t.status === "in_progress" || t.status === "review") &&
            (!args.agentName ||
                (Array.isArray(t.assignedTo) ? t.assignedTo.includes(args.agentName) : t.assignedTo === args.agentName))
        );
    },
});

export const updateStatus = mutation({
    args: {
        id: v.id("tasks"),
        status: v.string(),
        output: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, {
            status: args.status,
            ...(args.output ? { output: args.output } : {})
        });
    },
});

export const assign = mutation({
    args: {
        id: v.id("tasks"),
        agentName: v.string()
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, {
            assignedTo: args.agentName,
            status: "assigned"
        });
    },
});

export const clearDone = mutation({
    args: {},
    handler: async (ctx) => {
        const doneTasks = await ctx.db
            .query("tasks")
            .filter((q) => q.eq(q.field("status"), "done"))
            .collect();

        for (const task of doneTasks) {
            await ctx.db.delete(task._id);
        }
    },
});

export const clearByStatus = mutation({
    args: { status: v.string() },
    handler: async (ctx, args) => {
        const tasks = await ctx.db
            .query("tasks")
            .filter((q) => q.eq(q.field("status"), args.status))
            .collect();

        for (const task of tasks) {
            await ctx.db.delete(task._id);
        }
    },
});

// Update task output (used by synthesis step)
export const updateOutput = mutation({
    args: {
        id: v.id("tasks"),
        output: v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, { output: args.output });
    },
});

// Append a new step output (for multi-step tasks)
export const appendOutput = mutation({
    args: {
        id: v.id("tasks"),
        title: v.string(),        // e.g., "Blog Article", "LinkedIn Post"
        content: v.string(),      // The actual deliverable
        agent: v.string(),        // Who produced it
    },
    handler: async (ctx, args) => {
        const task = await ctx.db.get(args.id);
        if (!task) return;

        const existingOutputs = task.outputs || [];
        const newStep = {
            stepNumber: existingOutputs.length + 1,
            title: args.title,
            content: args.content,
            agent: args.agent,
            createdAt: Date.now(),
        };

        await ctx.db.patch(args.id, {
            outputs: [...existingOutputs, newStep],
            // Also update legacy output for compatibility
            output: args.content,
        });
    },
});

export const reset = mutation({
    args: {},
    handler: async (ctx) => {
        const tasks = await ctx.db.query("tasks").collect();
        for (const task of tasks) {
            await ctx.db.delete(task._id);
        }
        const messages = await ctx.db.query("messages").collect();
        for (const msg of messages) {
            await ctx.db.delete(msg._id);
        }
    },
});

// Assign task with a workflow pipeline
export const assignWithWorkflow = mutation({
    args: {
        id: v.id("tasks"),
        workflow: v.array(v.string()), // e.g., ["Loki", "Jarvis"]
    },
    handler: async (ctx, args) => {
        const firstAgent = args.workflow[0];
        await ctx.db.patch(args.id, {
            workflow: args.workflow,
            currentStep: 0,
            assignedTo: firstAgent,
            status: "assigned",
        });
    },
});

// Handoff to next agent in workflow
// Handoff to next agent in workflow
export const handoff = mutation({
    args: {
        id: v.id("tasks"),
        output: v.optional(v.string()),
        agentName: v.optional(v.string()), // Required for parallel execution tracking
    },
    handler: async (ctx, args) => {
        const task = await ctx.db.get(args.id);
        if (!task) return;

        // Ad-hoc tasks (no workflow) -> Go straight to review
        if (!task.workflow) {
            await ctx.db.patch(args.id, {
                status: "review",
                assignedTo: "Tigerclaw",
                ...(args.output ? { output: args.output } : {}),
            });
            return;
        }

        // Parallel Execution Logic:
        // If assignedTo is an array, we only move to next step if THIS was the last agent
        if (Array.isArray(task.assignedTo)) {
            // Filter out the agent who just finished
            const remainingAgents = task.assignedTo.filter(a => a !== args.agentName);

            if (remainingAgents.length > 0) {
                // Still waiting for others
                await ctx.db.patch(args.id, {
                    assignedTo: remainingAgents,
                    // Append output immediately so others see it? Or wait? 
                    // Appending immediately constitutes "shared state" - good for collaboration.
                    ...(args.output ? { output: args.output } : {}),
                });
                return; // STAY on current step
            }
            // Else: Everyone finished! fall through to next step logic
        }

        // Move to next step
        const nextStep = (task.currentStep || 0) + 1;

        if (nextStep >= task.workflow.length) {
            // Special Case: Porter (Form Filler) tasks are single-step and need RAW output (JSON or text).
            // Skip Tigerclaw review/synthesis to prevent "Tabs" wrapping.
            const isPorterOnly = task.workflow.length === 1 && task.workflow[0] === "Porter";

            if (isPorterOnly) {
                await ctx.db.patch(args.id, {
                    status: "done",
                    currentStep: nextStep,
                    output: (args.output || task.output || ""),
                    // No assignedTo needed for done tasks
                });
            } else {
                // End of workflow → Trigger Final Review/Synthesis (Tigerclaw)
                await ctx.db.patch(args.id, {
                    status: "review",
                    currentStep: nextStep,
                    output: (args.output || task.output || ""),
                    assignedTo: "Tigerclaw", // Force synthesis step
                });
            }
        } else {
            // Move to next agent (or group of agents)
            const nextStage = task.workflow[nextStep];
            // Normalize next assignment (string or string[])
            const nextAssignedTo = Array.isArray(nextStage) ? nextStage : (nextStage as string);

            // Hard gate for LinkedIn overlay hook selection (pause before Ive).
            const titleLower = (task.title || "").toLowerCase();
            const descLower = (task.description || "").toLowerCase();
            const workflowStr = JSON.stringify(task.workflow || []).toLowerCase();
            const looksLikeLinkedIn =
                titleLower.includes("linkedin") ||
                descLower.includes("linkedin") ||
                titleLower.startsWith("draft content:") ||
                (workflowStr.includes("ogilvy") && workflowStr.includes("carnegie") && workflowStr.includes("ive"));
            const needsHookPick = looksLikeLinkedIn && nextAssignedTo === "Ive" && !task.selectedOverlayHook;

            if (needsHookPick) {
                const outputs = (task.outputs || []) as Array<{ agent: string; title: string; content: string }>;
                const writer = outputs.find((o) => o.agent === "Ogilvy" || o.title.toLowerCase().includes("writer"));
                const editor = outputs.find((o) => o.agent === "Carnegie" || o.title.toLowerCase().includes("editor"));
                let candidates = collectOverlayHookCandidates(writer?.content, editor?.content, task.description);
                if (candidates.length === 0) {
                    const fallbackText = normalizeOverlayHookCandidate((task.title || "").replace(/^draft content:\s*/i, ""));
                    candidates = fallbackText
                        ? [{ id: makeHookId(fallbackText, 1), text: fallbackText, source: "fallback" as const }]
                        : [];
                }

                const existingOutputs = task.outputs || [];
                const recStep = {
                    stepNumber: existingOutputs.length + 1,
                    title: "Recommendations",
                    content: "Select a hook to render on the image (max 2 lines):\n\n" + candidates.map((c) => `- ${c.text}`).join("\n"),
                    agent: "System",
                    createdAt: Date.now(),
                };

                await ctx.db.patch(args.id, {
                    status: "awaiting_hook",
                    assignedTo: undefined,
                    currentStep: nextStep,
                    overlayHookCandidates: candidates,
                    outputs: [...existingOutputs, recStep],
                    ...(args.output ? { output: args.output } : {}),
                });
                return;
            }

            await ctx.db.patch(args.id, {
                assignedTo: nextAssignedTo,
                currentStep: nextStep,
                status: "in_progress",
                ...(args.output ? { output: args.output } : {}),
            });
        }
    },
});

export const selectOverlayHook = mutation({
    args: {
        id: v.id("tasks"),
        hook: v.string(),
        hookId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const task = await ctx.db.get(args.id);
        if (!task) return;

        const hook = normalizeWhitespace(args.hook);
        if (!hook) return;

        let resolvedHookId = normalizeWhitespace(args.hookId || "");
        if (!resolvedHookId && Array.isArray(task.overlayHookCandidates)) {
            const normalizedCandidates = task.overlayHookCandidates
                .map((candidate, index) => {
                    if (typeof candidate === "string") {
                        const text = normalizeOverlayHookCandidate(candidate);
                        return text ? { id: makeHookId(text, index + 1), text } : null;
                    }
                    if (candidate && typeof candidate === "object") {
                        const entry = candidate as Record<string, unknown>;
                        const text = normalizeOverlayHookCandidate(typeof entry.text === "string" ? entry.text : "");
                        if (!text) return null;
                        const id = typeof entry.id === "string" && normalizeWhitespace(entry.id)
                            ? normalizeWhitespace(entry.id)
                            : makeHookId(text, index + 1);
                        return { id, text };
                    }
                    return null;
                })
                .filter((candidate): candidate is { id: string; text: string } => Boolean(candidate));
            resolvedHookId = normalizedCandidates.find((candidate) => candidate.text.toLowerCase() === hook.toLowerCase())?.id || "";
        }

        // Replace any prior selection line in the description.
        const existingDesc = task.description || "";
        const cleanedDesc = existingDesc
            .replace(/\n?\s*SELECTED_OVERLAY_HOOK_ID:\s*.*$/gim, "")
            .replace(/\n?\s*SELECTED_OVERLAY_HOOK:\s*.*$/gim, "")
            .trimEnd();
        const nextDesc =
            `${cleanedDesc}\n\nSELECTED_OVERLAY_HOOK: ${hook}` +
            `${resolvedHookId ? `\nSELECTED_OVERLAY_HOOK_ID: ${resolvedHookId}` : ""}\n`;

        await ctx.db.patch(args.id, {
            selectedOverlayHook: hook,
            ...(resolvedHookId ? { selectedOverlayHookId: resolvedHookId } : {}),
            selectedOverlayHookAt: Date.now(),
            description: nextDesc,
            status: "in_progress",
            assignedTo: "Ive",
        });
    },
});

// Jarvis review decision
export const review = mutation({
    args: {
        id: v.id("tasks"),
        approved: v.boolean(),
        feedback: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        if (args.approved) {
            const task = await ctx.db.get(args.id);
            const existingOutput = task?.output || "";

            // Create a prominent FINAL OUTPUT header
            const finalOutputHeader = `
---

# 🏆 MISSION COMPLETE

> **Status:** ✅ APPROVED  
> **Reviewed by:** Tigerclaw  
> **Completed:** ${new Date().toISOString().split('T')[0]}

---

## 📋 Final Deliverable

The following is the consolidated output from all agents who worked on this mission:

---

`;
            const feedbackText = `\n\n---\n\n## ✅ Tigerclaw's Review\n\n${args.feedback || "Excellent work. Mission accomplished."}`;

            await ctx.db.patch(args.id, {
                status: "done",
                feedback: args.feedback || "Approved by Tigerclaw ✅",
                output: finalOutputHeader + existingOutput + feedbackText
            });

            // Trigger Memory Storage (Long-Term Memory)
            // We attribute the credit to the main agent (or team).
            // For simplicity, we just store it.
            // Note: assignedTo at this point is Tigerclaw (during review status), 
            // but we want to credit the actual worker? 
            // In the future, we can infer "Task Owner" from workflow.
            await ctx.scheduler.runAfter(0, api.memory.storeMemory, {
                agentName: "Swarm", // Generic attribution for now, or infer?
                taskId: args.id,
                content: `Title: ${task?.title}\nDescription: ${task?.description}\n\nOutput:\n${existingOutput}`,
                tags: ["mission_report", "approved"],
            });
        } else {
            // Send back for revision
            const task = await ctx.db.get(args.id);
            if (!task || !task.workflow) return;

            // Go back one step
            const prevStep = Math.max(0, (task.currentStep || 1) - 1);
            const prevAgent = task.workflow[prevStep];

            await ctx.db.patch(args.id, {
                status: "in_progress",
                assignedTo: prevAgent,
                currentStep: prevStep,
                feedback: args.feedback || "Needs revision",
            });
        }
    },
});

// Force cancel a task (User Stop Button)
export const cancel = mutation({
    args: { id: v.id("tasks") },
    handler: async (ctx, args) => {
        const task = await ctx.db.get(args.id);
        if (!task) return;
        await ctx.db.patch(args.id, {
            status: "cancelled",
            output: (task.output || "") + "\n\n[CANCELLED BY USER]",
            assignedTo: undefined // Stop agent work
        });
    },
});
