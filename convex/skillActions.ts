"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { exec } from "child_process";
import { promisify } from "util";
// import OpenAI from "openai";
// const pdfParse = require("pdf-parse");

export const generate = action({
    args: { skillId: v.id("skills") },
    handler: async (ctx, args) => {
        const skill = await ctx.runQuery(api.skills.get, { id: args.skillId });
        if (!skill) throw new Error("Skill not found");

        const resources = await ctx.runQuery(api.skills.getResources, { skillId: args.skillId });

        console.log(`[SKILL-BUILDER] Generating MD for "${skill.name}" with ${resources.length} resources...`);

        let aggregatedContext = "";

        // Process each resource
        for (const res of resources) {
            aggregatedContext += `\n\n--- RESOURCE: ${res.title} (${res.type}) ---\n`;

            if (res.type === "pdf" && res.storageId) {
                // PDF Parsing disabled for now
                aggregatedContext += `[PDF Content]: (PDF extraction disabled due to server runtime incompatibility. Please add text notes manually.)\n`;
            } else if (res.type === "link") {
                aggregatedContext += `URL: ${res.url}\n`;
            } else if (res.type === "text") {
                aggregatedContext += `${res.textContent}\n`;
            }
        }

        // Call Clawdbot CLI (via child_process)
        const execAsync = promisify(exec);

        const prompt = `You are Clawdbot, an expert AI architect.
    
    Your task is to create a "Skill File" (Agent Soul) for a new capability called: "${skill.name}".
    
    I have provided several resources below (PDFs, Videos, Links, Notes). 
    Synthesize all of them into a SINGLE, SHARP, PRECISE Markdown file (.md).
    
    The output should be ready to be dropped into an agent's "squad/" folder or used as a reference document.
    
    Structure:
    # ${skill.name} Protocol
    
    ## Core Objective
    (Brief summary of what this skill enables)
    
    ## Key Principles / Knowledge
    (Distilled insights from the resources)
    
    ## Standard Operating Procedures (SOPs)
    (Actionable steps on how to execute this skill)
    
    ## Resources & References
    (List the source links provided)
    
    ---
    
    RESOURCES PROVIDED:
    ${aggregatedContext}
    
    ---
    
    Generate the Markdown now. Do NOT include "Here is the file" chatter. Output ONLY the markdown content.`;

        console.log(`[SKILL-BUILDER] Delegating synthesis to Clawdbot CLI...`);
        const sessionId = `skill-builder-${args.skillId}`;
        const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');

        let generatedText = "(Generation failed)";

        try {
            // Adjust timeout as synthesis might take time
            // using the same command signature as services/llm.ts
            const { stdout } = await execAsync(
                `export PATH=$PATH:/usr/local/bin && ./node_modules/.bin/clawdbot agent --session-id "${sessionId}" --message "${escapedPrompt}" --json`,
                { encoding: 'utf-8', timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
            );

            const response = JSON.parse(stdout);
            if (response.status === 'ok' && response.result?.payloads?.[0]?.text) {
                generatedText = response.result.payloads[0].text + `\n\n*(Synthesized via Clawdbot CLI)*`;
            } else {
                console.error("Clawdbot response error:", stdout);
                generatedText = `(Clawdbot Generation Failed: Invalid Response)`;
            }

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.error("Clawdbot CLI execution failed:", message);
            generatedText = `(Clawdbot Generation Failed: ${message})`;
            // If local and authentication failed, we can't do much without env vars or a working CLI
        }

        // Save back to DB
        await ctx.runMutation(internal.skills.updateGeneratedMd, {
            id: args.skillId,
            md: generatedText,
        });

        return generatedText;
    },
});
