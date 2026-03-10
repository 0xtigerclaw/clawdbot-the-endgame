import * as fs from 'fs';
import * as path from 'path';
import { generateImage, createDesignPrompt } from './imageGen';
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { extractLinkedInOverlayText, generateLinkedInOverlayImage } from "./linkedinOverlay";

// ALL agents use Clawdbot (OpenAI quota exceeded, Clawdbot handles LLM calls)
const TOOL_AGENTS = ["Curie", "Torvalds", "Kotler", "Carnegie", "Ogilvy", "Tigerclaw", "Tesla", "Porter", "Dewey", "Ive", "Nolan"];

// Load agent SOUL file
function loadSoul(agentName: string): string {
    const soulPath = path.join(process.cwd(), 'squad', `${agentName.toLowerCase()}.md`);
    try {
        return fs.readFileSync(soulPath, 'utf-8');
    } catch {
        console.warn(`[SOUL] Could not load SOUL for ${agentName}: ${soulPath}`);
        return `Role: ${agentName}`;
    }
}

import { spawn } from 'child_process';

function extractFirstFencedJson(text: string): string | null {
    const match = text.match(/```json\s*\n([\s\S]*?)\n```/i);
    return match ? match[1] : null;
}

function normalizeStrictJsonFence(jsonStr: string): string {
    return `\`\`\`json\n${jsonStr.trim()}\n\`\`\``;
}

function tryParseJson(jsonStr: string): { ok: true } | { ok: false; message: string } {
    try {
        JSON.parse(jsonStr);
        return { ok: true };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, message };
    }
}

async function ensureValidStrictJsonOutput(
    agentName: string,
    rawText: string,
    runRepair: (repairPrompt: string) => Promise<string>,
): Promise<string> {
    const fenced = extractFirstFencedJson(rawText);
    const candidate = fenced ?? rawText;
    const firstPass = tryParseJson(candidate);
    if (firstPass.ok) return fenced ? normalizeStrictJsonFence(candidate) : rawText.trim();

    console.warn(`[STRICT JSON] ${agentName} produced invalid JSON. Attempting auto-repair. Parse error: ${firstPass.message}`);

    const repairPrompt = `Your previous output was NOT valid JSON and could not be parsed.

Fix it and return EXACTLY ONE fenced JSON block:
- Start with \`\`\`json
- End with \`\`\`
- The JSON inside must be strictly valid (no trailing commas, no comments).
- Do not add any prose or markdown outside the JSON fence.
- Preserve the same schema and meaning; only fix formatting/validity.

INVALID OUTPUT (fix this):
${rawText}`;

    const repaired = await runRepair(repairPrompt);
    const repairedFenced = extractFirstFencedJson(repaired);
    const repairedCandidate = repairedFenced ?? repaired;
    const repairedPass = tryParseJson(repairedCandidate);
    if (repairedPass.ok) return repairedFenced ? normalizeStrictJsonFence(repairedCandidate) : repaired.trim();

    console.warn(`[STRICT JSON] ${agentName} auto-repair failed. Keeping original output. Parse error: ${repairedPass.message}`);
    return rawText.trim();
}

async function runClawdbot(
    agentName: string,
    prompt: string,
    imageResult: { localPath: string } | null,
    strictJsonOutput = false,
    sessionScope: string = "",
): Promise<string> {
    console.log(`[LLM] Delegating to Clawdbot CLI for ${agentName}...`);
    const safeScope = (sessionScope || "default")
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "-")
        .slice(0, 64);
    const sessionId = `mission-control-${agentName.toLowerCase()}-${safeScope}`;

    // Use spawn instead of exec to avoid shell injection
    return new Promise((resolve, reject) => {
        const binPath = './node_modules/.bin/clawdbot';

        // Ensure arguments are passed as an array to bypass shell interpretation
        const args = [
            'agent',
            '--session-id', sessionId,
            '--message', prompt,
            '--json'
        ];

        const child = spawn(binPath, args, {
            env: {
                ...process.env,
                PATH: (process.env.PATH || '') + ':/usr/local/bin',
                // Clawdbot CLI requires BRAVE_SEARCH_API_KEY, but we use BRAVE_API_KEY in .env
                BRAVE_SEARCH_API_KEY: process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY
            },
            stdio: ['ignore', 'pipe', 'pipe'] // Explicitly ignore stdin to prevent background suspension
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('error', (err) => {
            reject(new Error(`Spawn error: ${err.message}`));
        });

        child.on('close', (code) => {
            if (code !== 0) {
                console.error(`[LLM] Clawdbot exited with code ${code}`);
                console.error(`[LLM] Stderr: ${stderr}`);
                // Try to parse error from JSON if possible, otherwise use stderr
                reject(new Error(`Clawdbot failed (code ${code}): ${stderr}`));
                return;
            }

            try {
                // Find JSON in output (sometimes there are logs before/after)
                const jsonMatch = stdout.match(/\{[\s\S]*\}/);
                if (!jsonMatch) {
                    reject(new Error(`No JSON found in output: ${stdout.substring(0, 200)}...`));
                    return;
                }

                const response = JSON.parse(jsonMatch[0]);

                if (response.status === 'ok' && response.result?.payloads?.[0]?.text) {
                    let text = response.result.payloads[0].text;

                    // Append generated image if any
                    if (imageResult && agentName.toLowerCase() === "ive") {
                        text += `\n\n---\n\n### 🎨 Generated Visual\n\n![Design Mockup](${imageResult.localPath})\n\n*Visual mockup created by Ive*`;
                    }
                    resolve(strictJsonOutput ? text.trim() : text + `\n\n*(via Clawdbot CLI)*`);
                } else {
                    reject(new Error("Invalid JSON structure from Clawdbot"));
                }
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                reject(new Error(`Failed to parse Clawdbot output: ${message}`));
            }
        });
    });
}

export async function generateAgentResponse(
    agentName: string,
    role: string,
    task: string,
    previousOutput: string = "",
    relevantContext: string = "", // RAG Context
    onActivity?: (type: string, content: string) => void,
    sessionScope: string = "",
): Promise<string> {
    console.log(`[LLM] ${agentName} (${role}) thinking about: "${task}"...`);
    if (onActivity) onActivity("log", `Thinking about: "${task.substring(0, 50)}..."`);

    const soul = loadSoul(agentName);
    console.log(`[SOUL] Loaded personality for ${agentName} (${soul.length} chars)`);

    // Special handling for Ive (Designer) - generate images
    let imageResult: { url: string; localPath: string } | null = null;
    if (agentName.toLowerCase() === "ive") {
        console.log(`[LLM] Ive detected - will generate LinkedIn visual...`);

        // Prefer deterministic overlays on a reference template (better brand consistency).
        const defaultTemplatePath = path.resolve(__dirname, "..", "public", "templates", "linkedin_base.png");
        const templatePath = process.env.LINKEDIN_TEMPLATE_PATH || defaultTemplatePath;
        const selectedMatch = `${task}\n\n${previousOutput}`.match(/SELECTED_OVERLAY_HOOK:\s*(.+)$/im);
        const selected = (selectedMatch?.[1] || "").trim();
        const overlayText = selected
            ? selected
            : extractLinkedInOverlayText(task, previousOutput);

        imageResult = await generateLinkedInOverlayImage({
            templatePath,
            overlayText,
            agentName,
        });

        if (imageResult) {
            console.log(`[LLM] Ive overlay image created using template: ${templatePath}`);
            console.log(`[LLM] Ive overlay text: "${overlayText}"`);
        } else {
            console.warn(
                `[LLM] Ive overlay image not created (template missing/unreadable or no overlay text). ` +
                `Template attempted: ${templatePath}. Overlay text: "${overlayText}".`,
            );
            // Only allow generative fallback if explicitly enabled.
            const allowFallback = (process.env.IVE_ALLOW_GENERATIVE_FALLBACK || "").toLowerCase() === "true";
            if (allowFallback) {
                const designPrompt = createDesignPrompt(task);
                imageResult = await generateImage(designPrompt, agentName);
            }
        }
    }

    const strictJsonOutput = ["Curie", "Ogilvy", "Carnegie"].includes(agentName);

    // Build the prompt with Task at the TOP for maximum attention
    const prompt = `## CURRENT MISSION (TASK)
You have been assigned the following task. Execute it precisely.

**TASK:** ${task}

---

## Your Identity: ${agentName}, a ${role}

${soul}

---

## 🧠 Relevant Past Experience (Long-Term Memory)
${(relevantContext && !(agentName === "Porter" && task.includes("Company Knowledge Context")))
            ? "You have successfully completed similar missions in the past. Use these insights to guide your current work:\n\n" + relevantContext
            : "(No relevant past memories found or redundant with current context)"}

---

## Context from Previous Agents
The following work has already been done on this mission. READ IT CAREFULLY.
Your job is to BUILD UPON this work, not replace it.

${previousOutput ? previousOutput : "(No previous work)"}

---

**CRITICAL OUTPUT INSTRUCTIONS:**
- If the task asks you to WRITE something (blog, article, email, copy), your output should BE that thing. Output the actual blog/article/email itself, properly formatted.
- If the task asks you to CODE something, output the actual code with explanations.
- If the task asks you to RESEARCH or ANALYZE, output a proper research report.
- Do NOT write "Mission Report" about doing the task. Actually DO the task and output the result.
${strictJsonOutput
            ? `- Output must be machine-readable only.
- Return exactly one fenced JSON block and no extra prose before or after it.
- Do not include sign-offs, "Agent Notes", provider labels, or markdown outside the JSON fence.`
            : `Format your output in clean, professional Markdown.
At the very end, add a brief "Agent Notes" section (2-3 lines max) with any recommendations.`}

**Output the actual deliverable below:**
`;

    try {
        // Priority 1: Tool-enabled Agents use Clawdbot
        if (TOOL_AGENTS.includes(agentName)) {
            console.log(`[LLM] ${agentName} is a Tool-Enabled Agent. Using Clawdbot...`);
            if (onActivity) onActivity("action", `Delegating to Clawdbot CLI...`);
            const raw = await runClawdbot(agentName, prompt, imageResult, strictJsonOutput, sessionScope);
            if (!strictJsonOutput) return raw;

            return await ensureValidStrictJsonOutput(agentName, raw, async (repairPrompt) => {
                // Keep the repair prompt minimal and focused to avoid re-triggering the full mission template.
                return await runClawdbot(agentName, repairPrompt, null, true, sessionScope);
            });
        }

        // Priority 2: Ive uses Gemini (Visual Specialist)
        if (agentName.toLowerCase() === "ive") {
            console.log(`[LLM] Using Gemini for Ive (Visual Specialist)...`);
            if (onActivity) onActivity("action", `Generating visual metrics with Gemini...`);
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

            const result = await model.generateContent(prompt);
            const response = result.response;
            let text = response.text();

            if (imageResult) {
                text += `\n\n---\n\n### 🎨 Generated Visual\n\n![Design Mockup](${imageResult.localPath})\n\n*Visual mockup created by Ive*`;
            }

            return strictJsonOutput ? text.trim() : text + `\n\n*(via Gemini: gemini-2.0-flash)*`;

        } else {
            // Priority 3: Everyone else uses OpenAI (Tigerclaw, Ogilvy, etc.)
            console.log(`[LLM] Using OpenAI (gpt-4o) for ${agentName}...`);
            if (onActivity) onActivity("action", `Calling OpenAI (gpt-4o)...`);
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

            const completion = await openai.chat.completions.create({
                messages: [{ role: "system", content: prompt }],
                model: "gpt-4o",
            });

            const text = completion.choices[0].message.content || "(No response generated)";
            return strictJsonOutput ? text.trim() : text + `\n\n*(via OpenAI: gpt-4o)*`;
        }

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[LLM] Generation failed:", message);

        // Fallback to Clawdbot if main provider failed
        try {
            console.log(`[LLM] Falling back to Clawdbot CLI...`);
            return await runClawdbot(agentName, prompt, imageResult, strictJsonOutput, sessionScope);
        } catch (fallbackError) {
            console.error("[LLM] Fallback failed:", fallbackError);
        }

        // Even on error, if Ive has an image, return it
        if (imageResult && agentName.toLowerCase() === "ive") {
            return `## Mission Report: Design Mockup\n\n**Agent:** Ive\n**Status:** PARTIAL SUCCESS\n\n### Visual Mockup\n\n![Design Mockup](${imageResult.localPath})\n\n*Visual created by Ive (text generation failed)*\n\n---\n\n*(Image generated successfully, text generation failed)*`;
        }

        return `## ❌ Mission Failed\n**Agent:** ${agentName}\n**Status:** FAILED\n\n> LLM Gateway error.\n\n### Error\n\`\`\`\n${message}\n\`\`\`\n\n*System Alert*`;
    }
}
