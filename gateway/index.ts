import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as dotenv from "dotenv";
import { generateAgentResponse } from "../services/llm";
import { clearActiveTask, logToDaily } from "../services/memory";
import { startScheduler } from "./scheduler";
import { startTelegramBot } from "./telegram";
import { startStandupScheduler } from "./standup";
import type { Doc } from "../convex/_generated/dataModel";
dotenv.config({ path: ".env.local" });

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

type Agent = Doc<"agents">;
type Task = Doc<"tasks">;
type MemorySearchResult = Doc<"memories"> & { score: number };

// ---------------------------------------------------------------------
// 4. MAIN EVENT LOOP (Non-Blocking Parallel Dispatcher)
// ---------------------------------------------------------------------

// Track active agents to prevent double-scheduling
// Map<AgentName, StartTime>
const runningAgents = new Map<string, number>();
const MAX_CONCURRENT = 4; // Safer for local dev (was 10)
const AGENT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes timeout

function stripAgentFooter(text: string): string {
    return text.replace(/\n\n\*\(via Clawdbot CLI\)\*\s*$/i, "").trim();
}

function debugClip(text: string, maxChars = 3500): string {
    const normalized = (text || "").trim();
    if (normalized.length <= maxChars) return normalized;
    return `${normalized.slice(0, maxChars)}…`;
}

function isDeweyLedgerTask(agentName: string, taskTitle: string): boolean {
    return agentName === "Dewey" && taskTitle.startsWith("Daily System Snapshot - ");
}

function normalizeComparableUrl(raw: string): string {
    const trimmed = (raw || "").trim();
    if (!trimmed) return "";
    const unwrapped = trimmed.replace(/^<(.+)>$/, "$1").replace(/^["'](.+)["']$/, "$1").trim();
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(unwrapped) ? unwrapped : `https://${unwrapped}`;
    try {
        const parsed = new URL(withScheme);
        parsed.hash = "";
        return parsed.toString().replace(/[)\].,;]+$/, "");
    } catch {
        return "";
    }
}

function extractIntelUrlsFromTaskDescription(description: string | undefined): Set<string> {
    const allowed = new Set<string>();
    if (!description) return allowed;
    const lines = description.split("\n");
    for (const line of lines) {
        const match = line.match(/^\s*URL:\s*(\S+)\s*$/i);
        if (!match?.[1]) continue;
        const normalized = normalizeComparableUrl(match[1]);
        if (normalized) allowed.add(normalized);
    }
    return allowed;
}

function extractWordLimit(taskPrompt: string): number | null {
    const match = taskPrompt.match(/Word Limit:\s*(\d+)\s*words/i);
    if (!match) return null;
    const n = Number(match[1]);
    return Number.isFinite(n) ? n : null;
}

function startsWithBannedPitch(text: string): boolean {
    const cleaned = stripAgentFooter(text).toLowerCase().trim();
    const bannedStarts = [
        "we are ",
        "we are building",
        "we are creating",
        "we are focused on",
        "our mission is",
        "at sorachain",
        "on the surface",
    ];
    return bannedStarts.some((p) => cleaned.startsWith(p));
}

function containsForbiddenPhrase(text: string): boolean {
    const cleaned = stripAgentFooter(text).toLowerCase();
    const forbidden = [
        "we are working on",
        "we are building",
        "our mission is",
        "at sorachain",
        "on the surface",
    ];
    return forbidden.some((p) => cleaned.includes(p));
}

function exceedsWordLimit(text: string, limit: number): boolean {
    const words = stripAgentFooter(text).split(/\s+/).filter(Boolean).length;
    return words > limit;
}

function shouldRunEssayQualityGate(agentName: string, task: Task): boolean {
    return agentName === "Porter" && task.title.startsWith("Draft Essay:");
}

async function enforceEssayQuality(
    agentName: string,
    agentRole: string,
    taskPrompt: string,
    report: string,
    relevantContext: string,
    sessionScope: string = "",
): Promise<string> {
    const wordLimit = extractWordLimit(taskPrompt);
    const violations: string[] = [];

    if (startsWithBannedPitch(report)) {
        violations.push("Draft starts with a banned generic pitch opener.");
    }
    if (containsForbiddenPhrase(report)) {
        violations.push("Draft contains forbidden generic pitch phrasing.");
    }
    if (wordLimit && exceedsWordLimit(report, wordLimit)) {
        violations.push(`Draft exceeds word limit (${wordLimit} words).`);
    }

    if (violations.length === 0) return report;

    const rewritePrompt = `${taskPrompt}

[QUALITY GATE FAILED]
The previous draft failed these checks:
${violations.map((v) => `- ${v}`).join("\n")}

Rewrite the draft to pass all checks.
Return ONLY the final revised essay text.
Do not include labels, headings, or sign-offs.
`;

    const revised = await generateAgentResponse(
        agentName,
        agentRole,
        rewritePrompt,
        "",
        relevantContext,
        () => void 0,
        sessionScope,
    );

    return stripAgentFooter(revised);
}

async function main() {
    // Helper to log to UI
    const logActivity = async (agentName: string, type: string, content: string) => {
        try {
            await client.mutation(api.agents.logActivity, { agentName, type, content });
        } catch (e) {
            console.error("Failed to log activity:", e);
        }
    };

    console.log("Clawdbot the Endgame gateway online.");

    // 1. Fetch agents check with retry
    let initialAgents: Agent[] = [];
    const maxRetries = 30; // Wait up to 60s
    for (let i = 0; i < maxRetries; i++) {
        try {
            initialAgents = await client.query(api.agents.list, {});
            break;
        } catch (e) {
            if (i === maxRetries - 1) {
                console.error("Failed to connect to Convex after retries.");
                throw e;
            }
            console.log(`[GATEWAY] Waiting for Convex Backend... (${i + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    if (initialAgents.length === 0) {
        console.log("No agents found! Run 'npx convex run agents:initSquad' first.");
        return;
    }

    // 2. Start schedulers
    startScheduler();
    startTelegramBot();
    startStandupScheduler();

    // 3. Main Loop
    console.log("Starts mission control loop (Non-Blocking Parallel Dispatcher)...");

    const roleKeywords: Record<string, string> = {
        "video": "Nolan", "movie": "Nolan", "remotion": "Nolan", "render": "Nolan", "clip": "Nolan",
        "blog": "Ogilvy", "post": "Ogilvy", "content": "Ogilvy", "article": "Ogilvy", "write": "Ogilvy", "copy": "Ogilvy",
        "code": "Torvalds", "bug": "Torvalds", "feature": "Torvalds", "implement": "Torvalds", "fix": "Torvalds", "develop": "Torvalds", "api": "Torvalds",
        "design": "Ive", "ui": "Ive", "ux": "Ive", "mockup": "Ive", "visual": "Ive", "brand": "Ive", "image": "Ive", "logo": "Ive",
        "email": "Carnegie", "newsletter": "Carnegie", "campaign": "Carnegie",
        "social": "Kotler", "twitter": "Kotler", "linkedin": "Kotler",
        "docs": "Dewey", "documentation": "Dewey", "readme": "Dewey",
        // Porter: SEO Specialist (removed generic "search" to avoid conflict with tool usage)
        "seo": "Porter", "keyword": "Porter", "ranking": "Porter", "serp": "Porter",
        // Curie: Research / Scout
        "research": "Curie", "analyze": "Curie", "market": "Curie", "scan": "Curie", "intel": "Curie",
        "product": "Tesla", "roadmap": "Tesla", "spec": "Tesla", "prd": "Tesla",

    };

    setInterval(async () => {
        try {
            // Fetch System Status
            const systemStatus = await client.query(api.system.getStatus, {});
            if (systemStatus?.status !== "online") {
                // Silently skip if offline to avoid log bloat
                return;
            }

            // WATCHDOG: Clear stalled agents
            const now = Date.now();
            for (const [agent, startTime] of runningAgents.entries()) {
                if (now - startTime > AGENT_TIMEOUT_MS) {
                    console.warn(`[WATCHDOG] Force-clearing stalled agent: ${agent}`);
                    runningAgents.delete(agent);
                    // Also mark agent as sleeping in DB so it doesn't look busy
                    // Finding ID is hard without list process, but next runAgentStep handles it.
                }
            }

            // Fetch Latest State
            const agents = await client.query(api.agents.list, {});
            const allTasks = await client.query(api.tasks.list, {});

            const inboxTasks = allTasks.filter(t => t.status === "inbox");
            const workingTasks = allTasks.filter(t => t.status === "assigned" || t.status === "in_progress");
            const reviewTasks = allTasks.filter(t => t.status === "review");

            // A. TIGERCLAW ASSIGNS (Inbox)
            for (const task of inboxTasks) {
                console.log(`[INBOX] Tigerclaw analyzing: "${task.title}"`);

                // Determine roles based on content
                const titleLower = task.title.toLowerCase();
                const descriptionLower = (task.description || "").toLowerCase();
                let selectedRole = "Generalist";

                // 1. High-priority Title Match (prevents description data from hijacking routing)
                for (const [keyword, role] of Object.entries(roleKeywords)) {
                    if (titleLower.includes(keyword)) {
                        console.log(`[DEBUG] Title Match: "${keyword}" -> ${role}`);
                        selectedRole = role;
                        break;
                    }
                }

                // 2. Fallback to Description ONLY if no title match
                if (selectedRole === "Generalist") {
                    for (const [keyword, role] of Object.entries(roleKeywords)) {
                        if (descriptionLower.includes(keyword)) {
                            console.log(`[DEBUG] Description Match: "${keyword}" -> ${role}`);
                            selectedRole = role;
                            break;
                        }
                    }
                }

                const agent = agents.find(a => a.name === selectedRole || a.role === selectedRole) || agents[0];

                await client.mutation(api.tasks.assign, { id: task._id, agentName: agent.name });
                console.log(`[ASSIGN] Assigned "${task.title}" to ${agent.name} (${selectedRole})`);
                logActivity("Tigerclaw", "action", `Assigned "${task.title}" to ${agent.name}`);
            }

            // B. SPECIALIST WORKS (Parallel - but strictly one task per agent)
            const workItems: { task: Task, agentName: string }[] = [];

            for (const t of workingTasks) {
                if (Array.isArray(t.assignedTo)) {
                    t.assignedTo.forEach((agent: string) => workItems.push({ task: t, agentName: agent }));
                } else if (typeof t.assignedTo === 'string') {
                    workItems.push({ task: t, agentName: t.assignedTo });
                }
            }

            // Filter for IDLE agents only AND ensure one task per agent in THIS batch
            const availableItems: typeof workItems = [];
            const currentlyProcessing = new Set(runningAgents.keys());

            for (const item of workItems) {
                if (!currentlyProcessing.has(item.agentName)) {
                    availableItems.push(item);
                    currentlyProcessing.add(item.agentName); // Reserve this agent for this cycle
                }
            }

            // Shuffle and take batch
            const batch = availableItems.sort(() => Math.random() - 0.5).slice(0, MAX_CONCURRENT);

            if (batch.length > 0) {
                console.log(`[DISPATCH] Launching ${batch.length} threads: ${batch.map(b => b.agentName).join(", ")}`);
                batch.forEach(item => {
                    runningAgents.set(item.agentName, Date.now()); // Mark busy in the global map
                    runAgentStep(item.task, item.agentName, agents);
                });
            }

            // C. TIGERCLAW REVIEWS (Separate logic from work)
            for (const task of reviewTasks) {
                if (runningAgents.has("Tigerclaw")) continue;

                runningAgents.set("Tigerclaw", Date.now());
                runTigerclawReview(task, agents);
            }

        } catch (error) {
            console.error("Gateway Loop Error:", error);
        }
    }, 3000);
}

// Tigerclaw Review Handler (Separate from work)
async function runTigerclawReview(task: Task, agents: Agent[]) {
    try {
        console.log(`[REVIEW] Tigerclaw reviewing: "${task.title}"`);
        client.mutation(api.agents.logActivity, { agentName: "Tigerclaw", type: "log", content: `Reviewing: "${task.title}"` }).catch(() => ({}));

        // 90% approval rate (simulated decision)
        const approved = Math.random() > 0.1;

        if (approved) {
            console.log(`[SYNTHESIS] Tigerclaw generating consolidated final output...`);

            // Determine step title based on task content AND feedback (for follow-ups)
            const existingOutputs = task.outputs || [];
            const stepNumber = existingOutputs.length + 1;
            let stepTitle = `Step ${stepNumber} Deliverable`;


            // Check both title and feedback for context (feedback contains follow-up request)
            const contextToCheck = (task.title + " " + (task.feedback || "")).toLowerCase();
            console.log(`[DEBUG] Step Inference: Feedback="${task.feedback}" Context="${contextToCheck}"`);

            // For follow-up steps, prefer feedback context over title
            if (task.feedback && (task.feedback.includes("Follow-up") || task.feedback.includes("Reopened"))) {
                console.log("[DEBUG] Detected Follow-up/Reopened");
                // This is a follow-up request - infer from feedback
                if (contextToCheck.includes('linkedin')) stepTitle = 'LinkedIn Post';
                else if (contextToCheck.includes('x post')) stepTitle = 'X Post';
                else if (contextToCheck.includes('twitter') || contextToCheck.includes('tweet') || contextToCheck.includes('thread')) stepTitle = 'Twitter Thread';
                else if (contextToCheck.includes('email')) stepTitle = 'Email Draft';
                else if (contextToCheck.includes('summary') || contextToCheck.includes('summarize')) stepTitle = 'Summary';
                else if (contextToCheck.includes('design') || contextToCheck.includes('mockup') || contextToCheck.includes('visual') || contextToCheck.includes('image') || contextToCheck.includes('cover')) stepTitle = 'Design Mockup';
                else if (contextToCheck.includes('repurpose')) stepTitle = 'Repurposed Content';
                else stepTitle = `Step ${stepNumber} Follow-up`;
            } else {
                // Original task - infer from title
                const titleLower = task.title.toLowerCase();
                if (titleLower.includes('blog') || titleLower.includes('article')) stepTitle = 'Blog Article';
                else if (titleLower.includes('linkedin')) stepTitle = 'LinkedIn Post';
                else if (titleLower.includes('twitter') || titleLower.includes('tweet')) stepTitle = 'Twitter Thread';
                else if (titleLower.includes('email')) stepTitle = 'Email Draft';
                else if (titleLower.includes('code') || titleLower.includes('implement')) stepTitle = 'Code Implementation';
                else if (titleLower.includes('research') || titleLower.includes('analyze')) stepTitle = 'Research Report';
                else if (titleLower.includes('design') || titleLower.includes('mockup')) stepTitle = 'Design Mockup';
                else stepTitle = 'Deliverable';
            }

            // Different synthesis based on whether this is a follow-up or original task
            const isFollowUp = task.feedback && task.feedback.includes("Follow-up");

            let finalOutput = "";
            const imageMarkdown = ""; // Placeholder to fix lint error

            if (isFollowUp && task.feedback) {
                // FOLLOW-UP: Focus on the specific request, not the whole history
                const followUpRequest = task.feedback.replace(/Follow-up: "|" \(Previous output preserved\)/g, '');

                // Format-specific instructions
                let formatInstructions = '';
                if (stepTitle === 'LinkedIn Post') {
                    formatInstructions = `
FORMAT: LinkedIn Post
- Start with a BOLD hook line (1 sentence that grabs attention)
- 2-3 short paragraphs (2-4 lines each)
- Use line breaks between paragraphs for readability
- Include 3-5 bullet points for key insights
- End with a question to drive engagement
- Add 5-8 relevant hashtags at the very end
- Total length: 1300-2000 characters (ideal LinkedIn engagement range)
- NO headers, NO "Blog Article" text, NO agent notes`;
                } else if (stepTitle === 'X Post' || stepTitle === 'Twitter Thread') {
                    formatInstructions = `
FORMAT: X/Twitter Post
- If single post: 280 characters max, punchy and memorable
- If thread: Number each tweet (1/, 2/, etc.)
- Start with a provocative hook that stops the scroll
- Use short sentences and line breaks
- Each tweet should stand alone but connect to next
- End thread with a CTA or question
- 3-5 hashtags max (at the end only)
- NO headers, NO "Blog Article" text, NO agent notes`;
                } else if (stepTitle === 'Email Draft') {
                    formatInstructions = `
FORMAT: Email
- Start with "Subject: [compelling subject line]"
- Professional but warm greeting
- Clear structure: context, main point, action
- Keep paragraphs short (2-3 sentences)
- End with clear CTA
- Sign off professionally`;
                }

                const synthesisPrompt = `You are Tigerclaw, the Squad Lead.

A follow-up task has been completed. The user asked for: "${followUpRequest}"
The original task was: "${task.title}"

YOUR TASK: Create ONLY the requested ${stepTitle} deliverable.
${formatInstructions}

CRITICAL RULES:
- Output ONLY the final content - no meta-commentary
- Do NOT repeat the original blog/article content
- Do NOT prefix with "Here's the..." or "Here is..."
- Start directly with the content

## SOURCE MATERIAL (from agents - use for context only)
${task.output?.split('---').slice(-3).join('\n\n').substring(0, 3000) || "(No output)"}

---

Now produce ONLY the ${stepTitle}:`;

                try {
                    finalOutput = await generateAgentResponse(
                        "Tigerclaw",
                        "Editor-in-Chief",
                        synthesisPrompt,
                        "",
                        "",
                        (type, content) => client.mutation(api.agents.logActivity, { agentName: "Tigerclaw", type, content }).catch(() => ({})),
                        `task-${task._id}`
                    );
                    console.log(`[SYNTHESIS] Follow-up output generated (${finalOutput.length} chars)`);
                } catch (error: unknown) {
                    console.error("Follow-up generation failed", error);
                    finalOutput = task.output || "";
                }

            } else {
                // ORIGINAL: Check for structured history first (Deterministic Tabs)
                const tabs: { id: string, label: string, content: string }[] = [];

                if (task.outputs && task.outputs.length > 0) {
                    console.log(`[SYNTHESIS] Found ${task.outputs.length} structured outputs. Building tabs...`);

                    // 1. Scout/Research (Priority - Raw Intelligence)
                    const scout = task.outputs.find(o => o.agent === "Curie" || o.title.includes("Scout") || o.title.includes("Research"));
                    if (scout) {
                        tabs.push({ id: "scout", label: "🔭 Intelligence (Curie)", content: scout.content });
                    }

                    // 2. Writer
                    const writer = task.outputs.find(o => o.agent === "Ogilvy" || o.title.includes("Writer"));
                    if (writer) tabs.push({ id: "writer", label: "✍️ Writer (Ogilvy)", content: writer.content });

                    // 3. Editor
                    const editor = task.outputs.find(o => o.agent === "Carnegie" || o.title.includes("Editor"));
                    if (editor) tabs.push({ id: "editor", label: "🔍 Editor (Carnegie)", content: editor.content });

                    // 4. Recommendations (Hook Picker)
                    const recommendations = task.outputs.find(o =>
                        o.title.includes("Recommendations") || o.title.includes("Hook") || o.agent === "System"
                    );
                    if (recommendations) tabs.push({ id: "recommendations", label: "🪝 Recommendations", content: recommendations.content });

                    // 5. Designer
                    const designer = task.outputs.find(o => o.agent === "Ive" || o.title.includes("Visual") || o.agent.includes("Designer"));
                    if (designer) tabs.push({ id: "designer", label: "🎨 Designer (Ive)", content: designer.content });

                    // 6. Source Trace (Raw Lineage)
                    // Extract from description after the "---" separator
                    if (task.description && task.description.includes("---")) {
                        const descriptionParts = task.description.split("---");
                        const traceContent = descriptionParts[descriptionParts.length - 1]?.trim();
                        if (traceContent && (traceContent.includes("SOURCE:") || traceContent.includes("INTEL FEED"))) {
                            tabs.push({ id: "trace", label: "🔍 Source Trace", content: traceContent });
                        }
                    }
                }

                if (tabs.length > 0) {
                    // Structured Data Found
                    console.log(`[SYNTHESIS] Built JSON from history (${tabs.length} tabs).`);

                    // Generate Review
                    const reviewPrompt = `You are Tigerclaw, the Squad Lead.
Review the mission results and provide a brief, professional sign-off.
Mission: "${task.title}"
Status: Complete.

Output only a short markdown review (2-3 lines).`;

                    try {
                        const review = await generateAgentResponse(
                            "Tigerclaw",
                            "Reviewer",
                            reviewPrompt,
                            "",
                            "",
                            (t, c) => client.mutation(api.agents.logActivity, { agentName: "Tigerclaw", type: t, content: c }).catch(() => ({})),
                            `task-${task._id}`
                        );
                        tabs.push({ id: "review", label: "✅ Tigerclaw", content: review });
                    } catch (e) {
                        console.log("[SYNTHESIS] Skip review generation due to error");
                    }

                    finalOutput = JSON.stringify({ tabs });

                } else {
                    // Fallback to LLM Synthesis (Legacy / No History)
                    console.log("[SYNTHESIS] No structured history found. Falling back to LLM synthesis.");
                    const synthesisPrompt = `You are Tigerclaw, the Squad Lead. 

A mission has been completed. Synthesize the results into a JSON object with four distinct tabs.

YOUR TASK:
Return a JSON object with this exact schema:
{
  "tabs": [
    { "id": "scout", "label": "🔭 Intelligence (Curie)", "content": "..." },
    { "id": "trace", "label": "🔍 Source Trace", "content": "..." },
    { "id": "writer", "label": "✍️ Writer (Ogilvy)", "content": "..." },
    { "id": "editor", "label": "🔍 Editor (Carnegie)", "content": "..." },
    { "id": "designer", "label": "🎨 Designer (Ive)", "content": "..." }
  ]
}

CONTENT REQUIREMENTS:
1. 🔭 Intelligence: The raw, curated findings from Curie. If Curie's output is JSON, preserve it exactly. If it's text, structure it for analysis.
2. 🔍 Source Trace: The raw source material Curie looked at (from the task description).
3. ✍️ Writer: The core consolidated deliverable (e.g., the Blog Post, Tweet, or Code). Focus on the primary output.
4. 🔍 Editor: A polished variation or structural critique. Improve momentum, cut fluff, and ensure it hits the "Editor" protocols.
5. 🎨 Designer: The visual brief, Veo prompt, or ASCII art concept associated with the content.

SOURCE MATERIAL:
${task.output || "(No output yet)"}

Now produce ONLY the valid JSON (no markdown fences):`;

                    try {
                        finalOutput = await generateAgentResponse(
                            "Tigerclaw",
                            "Editor-in-Chief",
                            synthesisPrompt,
                            "",
                            "",
                            (type, content) => client.mutation(api.agents.logActivity, { agentName: "Tigerclaw", type, content }).catch(() => ({})),
                            `task-${task._id}`
                        );
                    } catch (error: unknown) {
                        const message = error instanceof Error ? error.message : String(error);
                        console.error(`[SYNTHESIS] Failed to generate final output:`, message);
                        finalOutput = task.output || "";
                    }
                }
            }

            // Append the synthesized output as a new step
            await client.mutation(api.tasks.appendOutput, {
                id: task._id,
                title: stepTitle,
                content: finalOutput + imageMarkdown,
                agent: "Tigerclaw",
            });

            console.log(`[APPROVED] "${task.title}" marked as COMPLETE for this step.`);

            // CRITICAL: Check if we are in a multi-step workflow
            if (task.workflow && task.workflow.length > (task.currentStep || 0) + 1) {
                // Hand off to the next agent in the chain
                console.log(`[PIPELINE] Moving to next step in workflow...`);
                await client.mutation(api.tasks.handoff, {
                    id: task._id,
                    output: finalOutput + imageMarkdown,
                    agentName: "Tigerclaw" // Hand off from Reviewer
                });
            } else {
                // End of line -> Complete the task
                await client.mutation(api.tasks.review, {
                    id: task._id,
                    approved: true,
                    feedback: "Mission complete. Final deliverable synthesized. ✅",
                });
                client.mutation(api.agents.logActivity, { agentName: "Tigerclaw", type: "success", content: `APPROVED: "${task.title}"` }).catch(() => ({}));
                clearActiveTask();
            }

            console.log(`[APPROVED] "${task.title}" marked as DONE with step: "${stepTitle}".`);
            clearActiveTask();
        } else {
            await client.mutation(api.tasks.review, {
                id: task._id,
                approved: false,
                feedback: "Please revise. More detail needed.",
            });
            console.log(`[REVISION] "${task.title}" sent back for revision.`);
        }

        logToDaily("Tigerclaw", "Review Complete", `Reviewed: "${task.title}" - ${approved ? "Approved" : "Revision Requested"}`);

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[ERROR] Tigerclaw review failed:`, message);
    } finally {
        runningAgents.delete("Tigerclaw");

        const agent = agents.find(a => a.name === "Tigerclaw");
        if (agent) {
            client.mutation(api.agents.updateStatus, { id: agent._id, status: "sleeping" }).catch(() => { });
        }
    }
}

// Agent Execution Step
async function runAgentStep(task: Task, agentName: string, agents: Agent[]) {
    try {
        // Move to in_progress if not already
        if (task.status === "assigned") {
            console.log(`[STATUS] ${agentName} starting "${task.title}" -> in_progress`);
            await client.mutation(api.tasks.updateStatus, { id: task._id, status: "in_progress" });
        }

        // 50% chance to do work
        // Always execute immediately for form-filler tasks (Porter essays)
        const isFormFillerTask = agentName === "Porter" && task.title.startsWith("Draft Essay:");
        if (isFormFillerTask || Math.random() > 0.5) {
            console.log(`[WORK] ${agentName} executing step on "${task.title}"`);
            client.mutation(api.agents.logActivity, { agentName, type: "work", content: `Starting work on: "${task.title}"` }).catch(() => ({}));

            let taskPrompt = task.title;
            if (task.description) taskPrompt += `\n\n[CONTEXT/SUMMARY]: ${task.description}`;
            if (task.feedback) taskPrompt += `\n\n[ADDITIONAL INSTRUCTIONS/FEEDBACK]: ${task.feedback}`;

            if (agentName === "Ogilvy" || agentName === "Carnegie") {
                try {
                    const guidance = await client.query(api.linkedinAnalytics.getWritingGuidance, {
                        minImpressions: 300,
                        topN: 3,
                    }) as {
                        datasetSize: number;
                        baselineRate: number;
                        topHooks: Array<{ hookLine: string; engagementRate: number; impressions: number }>;
                        weakHooks: Array<{ hookLine: string; engagementRate: number; impressions: number }>;
                    };

                    const playbook = await client.query(api.linkedinAnalytics.getWritingPlaybook, {
                        minImpressions: 300,
                        sampleSize: 4,
                    }) as {
                        datasetSize: number;
                        baselineRate: number;
                        doMore: string[];
                        avoid: string[];
                        topSummary: {
                            medianChars: number;
                            avgLines: number;
                            avgParagraphs: number;
                            firstPersonRate: number;
                            bulletRate: number;
                            questionEndingRate: number;
                            avgSentenceWords: number;
                        };
                        topExamples: Array<{
                            hookLine: string;
                            excerpt: string;
                            impressions: number;
                            engagementRate: number;
                        }>;
                    };

                    if (guidance.datasetSize > 0) {
                        const sanitize = (text: string) => text.replace(/\s+/g, " ").trim();
                        const best = guidance.topHooks
                            .map((entry) => `- "${sanitize(entry.hookLine)}" (${(entry.engagementRate * 100).toFixed(2)}% @ ${entry.impressions} impressions)`)
                            .join("\n");
                        const weak = guidance.weakHooks
                            .map((entry) => `- "${sanitize(entry.hookLine)}" (${(entry.engagementRate * 100).toFixed(2)}% @ ${entry.impressions} impressions)`)
                            .join("\n");

                        taskPrompt += `\n\n[LINKEDIN PERFORMANCE FEEDBACK]\n` +
                            `Dataset size: ${guidance.datasetSize} posts (min 300 impressions)\n` +
                            `Baseline engagement rate: ${(guidance.baselineRate * 100).toFixed(2)}%\n` +
                            `Top-performing hook examples:\n${best}\n` +
                            `Underperforming hook examples:\n${weak}\n` +
                            `Instruction: keep the hook specific, high-contrast, and practical; avoid generic label-style hooks.`;

                        const styleDoMore = (playbook.doMore || []).map((line) => `- ${sanitize(line)}`).join("\n");
                        const styleAvoid = (playbook.avoid || []).map((line) => `- ${sanitize(line)}`).join("\n");
                        const styleExamples = (playbook.topExamples || [])
                            .slice(0, 2)
                            .map((example) =>
                                `- "${sanitize(example.hookLine)}" | ${(example.engagementRate * 100).toFixed(2)}% @ ${example.impressions} impressions\n` +
                                `  Excerpt: ${sanitize(example.excerpt)}`,
                            )
                            .join("\n");

                        taskPrompt += `\n\n[LINKEDIN WRITING PLAYBOOK FROM YOUR OWN POSTS]\n` +
                            `Top-post structure medians (min 300 impressions): ~${Math.round(playbook.topSummary.medianChars)} chars, ` +
                            `~${playbook.topSummary.avgLines.toFixed(1)} lines, ~${playbook.topSummary.avgParagraphs.toFixed(1)} paragraphs.\n` +
                            `Voice markers in top posts: first-person ${(playbook.topSummary.firstPersonRate * 100).toFixed(0)}%, ` +
                            `bullets ${(playbook.topSummary.bulletRate * 100).toFixed(0)}%, ` +
                            `question ending ${(playbook.topSummary.questionEndingRate * 100).toFixed(0)}%, ` +
                            `avg sentence length ${playbook.topSummary.avgSentenceWords.toFixed(1)} words.\n` +
                            `Do more:\n${styleDoMore}\n` +
                            `Avoid:\n${styleAvoid}\n` +
                            `Reference examples in your own tone:\n${styleExamples}\n` +
                            `Instruction: match this personal voice profile while staying factual and specific.`;
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    console.warn(`[LINKEDIN FEEDBACK] Skipping guidance injection: ${message}`);
                }
            }

            // RAG: Long-Term Memory
            let relevantContext = "";
            try {
                // console.log(`[RAG] Searching memories...`);
                const memories = await client.action(api.memory.searchMemories, { query: task.title, limit: 2 }) as MemorySearchResult[];
                if (memories && memories.length > 0) {
                    relevantContext = memories.map((m) =>
                        `### Past Mission: ${m.content.substring(0, 100)}...\n${m.content}\n(Similarity: ${(m.score * 100).toFixed(1)}%)`
                    ).join("\n\n");
                }
            } catch {
                // Ignore RAG errors
            }

            const agentRole = agents.find(a => a.name === agentName)?.role || "Generalist";

            if (isDeweyLedgerTask(agentName, task.title)) {
                const inputDebug = [
                    `[DEWEY_LEDGER_INPUT]`,
                    `taskId=${task._id}`,
                    `taskTitle=${task.title}`,
                    "",
                    debugClip(taskPrompt),
                ].join("\n");
                await client.mutation(api.agents.logActivity, {
                    agentName,
                    type: "debug",
                    content: inputDebug,
                });
                logToDaily(agentName, "Ledger Input Debug", inputDebug);
            }

            let report = await generateAgentResponse(
                agentName,
                agentRole,
                taskPrompt,
                task.output || "",
                relevantContext,
                (type, content) => client.mutation(api.agents.logActivity, { agentName, type, content }).catch(() => ({})),
                `task-${task._id}`
            );

            if (shouldRunEssayQualityGate(agentName, task)) {
                try {
                    report = await enforceEssayQuality(agentName, agentRole, taskPrompt, report, relevantContext, `task-${task._id}`);
                } catch (err) {
                    console.warn("[QUALITY GATE] Rewrite pass failed, keeping original draft:", err);
                }
            }

            if (isDeweyLedgerTask(agentName, task.title)) {
                const outputDebug = [
                    `[DEWEY_LEDGER_OUTPUT]`,
                    `taskId=${task._id}`,
                    `taskTitle=${task.title}`,
                    "",
                    debugClip(report),
                ].join("\n");
                await client.mutation(api.agents.logActivity, {
                    agentName,
                    type: "debug",
                    content: outputDebug,
                });
                logToDaily(agentName, "Ledger Output Debug", outputDebug);
            }

            logToDaily(agentName, "Work Complete", `Finished step on: "${task.title}"`);

            // SCOUT DATA BRIDGE (Universal Link Extractor)
            if (agentName === "Curie" || agentRole.includes("Scout") || report.includes("candidates") || report.includes("top_shifts")) {
                try {
                    console.log("[SCOUT BRIDGE] Attempting to extract findings...");

                    // Robust JSON extraction — try multiple strategies in order
                    let data: Record<string, unknown> | null = null;

                    // Strategy 1: lenient fenced JSON (handles optional spaces/CRs around fence markers)
                    const fenceMatch = report.match(/```json\s*\r?\n([\s\S]*?)\r?\n\s*```/i);
                    if (fenceMatch?.[1]) {
                        try { data = JSON.parse(fenceMatch[1]); } catch { /* try next */ }
                    }

                    // Strategy 2: first {...} block in the report
                    if (!data) {
                        const braceMatch = report.match(/\{[\s\S]*\}/);
                        if (braceMatch) {
                            try { data = JSON.parse(braceMatch[0]); } catch { /* try next */ }
                        }
                    }

                    // Strategy 3: entire report as-is (already-validated JSON from llm.ts)
                    if (!data) {
                        try { data = JSON.parse(report.trim()); } catch { /* give up */ }
                    }

                    if (!data) throw new Error("Could not extract valid JSON from Scout report");

                    // Support multiple schemas: .candidates, .top_shifts, or root array
                    let candidates: unknown[] = [];
                    if (Array.isArray(data.candidates)) candidates = data.candidates;
                    else if (Array.isArray(data.top_shifts)) candidates = data.top_shifts;
                    else if (Array.isArray(data)) candidates = data;

                    if (candidates.length > 0) {
                        const isScoutScanTask = task.title.startsWith("Scout Scan:");
                        const allowedIntelUrls = isScoutScanTask
                            ? extractIntelUrlsFromTaskDescription(task.description)
                            : new Set<string>();
                        let skippedNonIntel = 0;

                        console.log(`[SCOUT BRIDGE] Found ${candidates.length} candidates. Saving to DB...`);
                        for (const raw of candidates) {
                            const item = raw as Record<string, unknown>;
                            const sources = Array.isArray(item.sources) ? item.sources as Array<Record<string, unknown>> : [];
                            const sourceUrls = sources
                                .map((source) => normalizeComparableUrl(String(source?.url || "")))
                                .filter(Boolean);
                            const allowedSourceUrl = sourceUrls.find((sourceUrl) => allowedIntelUrls.has(sourceUrl));

                            // Map fields based on different schemas
                            const fallbackUrl = (sources[0]?.url as string)
                                || (item.brief as Record<string, unknown>)?.url as string
                                || item.url as string
                                || "https://example.com/missing-source";
                            const url = isScoutScanTask && allowedSourceUrl ? allowedSourceUrl : fallbackUrl;
                            const title = (item.title || item.shift || item.headline || "Untitled Scout Link") as string;
                            const summary = (item.event_summary || item.why_it_matters || (item.brief as Record<string, unknown>)?.summary || (item.brief as Record<string, unknown>)?.headline) as string | undefined;

                            if (isScoutScanTask) {
                                const normalizedSelectedUrl = normalizeComparableUrl(url);
                                if (!normalizedSelectedUrl || !allowedIntelUrls.has(normalizedSelectedUrl)) {
                                    skippedNonIntel += 1;
                                    continue;
                                }
                            }

                            await client.mutation(api.links.addLink, {
                                url: url,
                                title: title,
                                summary: summary,
                                agent: agentName,
                                taskId: task._id,
                                tags: [((item.bucket_id as string) || "general"), ...((item.tags as string[]) || [])],
                                qualityScore: (item.feature_score as number) || 7
                            });
                        }
                        if (isScoutScanTask && skippedNonIntel > 0) {
                            console.log(`[SCOUT BRIDGE] Skipped ${skippedNonIntel} candidate link(s) not present in pre-fetched intel URLs.`);
                        }
                        console.log(`[SCOUT BRIDGE] Successfully processed ${candidates.length} candidates.`);
                    }
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : String(error);
                    console.error("[SCOUT BRIDGE] Failed to parse Scout output:", message);
                }
            }

            // STORE STRUCTURED OUTPUT (Critical for tabs)
            await client.mutation(api.tasks.appendOutput, {
                id: task._id,
                title: agentRole, // e.g. "Writer", "Editor"
                content: report,
                agent: agentName
            });

            // Check if workflow complete (handoff)
            // For Porter-only tasks (form filler), use clean report as output (no agent prefix)
            const isPorterOnly = task.workflow?.length === 1 && task.workflow[0] === "Porter";
            const handoffOutput = isPorterOnly
                ? report
                : (task.output || "") + `\n\n**${agentName}:**\n${report}`;
            await client.mutation(api.tasks.handoff, {
                id: task._id,
                output: handoffOutput,
                agentName: agentName
            });
            console.log(`[DONE] ${agentName} finished step.`);

        } else {
            // Idle wait
        }

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[ERROR] ${agentName} failed:`, message);
        client.mutation(api.agents.logActivity, { agentName, type: "error", content: `Error: ${message}` }).catch(() => ({}));
    } finally {
        runningAgents.delete(agentName);

        // Update DB status to sleeping
        const agent = agents.find(a => a.name === agentName);
        if (agent) {
            // We do this fire-and-forget to not block cleanup
            client.mutation(api.agents.updateStatus, { id: agent._id, status: "sleeping" }).catch(() => { });
        }
    }
}

main();
