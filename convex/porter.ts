"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";

/**
 * Convex Action wrapper for Porter
 * Calls clawdbot CLI directly using Node.js runtime to avoid bundling errors
 */

async function runClawdbotInternal(message: string, sessionId: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const binPath = './node_modules/.bin/clawdbot';
        const args = [
            'agent',
            '--session-id', sessionId,
            '--message', message,
            '--json'
        ];

        const child = spawn(binPath, args, {
            env: {
                ...process.env,
                PATH: (process.env.PATH || '') + ':/usr/local/bin',
                BRAVE_SEARCH_API_KEY: process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY
            },
            stdio: ['ignore', 'pipe', 'pipe']
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
                reject(new Error(`Clawdbot failed (code ${code}): ${stderr}`));
                return;
            }

            try {
                const jsonMatch = stdout.match(/\{[\s\S]*\}/);
                if (!jsonMatch) {
                    reject(new Error(`No JSON found in output`));
                    return;
                }

                const response = JSON.parse(jsonMatch[0]);

                if (response.status === 'ok' && response.result?.payloads?.[0]?.text) {
                    resolve(response.result.payloads[0].text);
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

export const callPorter = action({
    args: {
        prompt: v.string(),
    },
    handler: async (ctx, args) => {
        try {
            // Load Porter's SOUL for consistency (optional but better)
            let soul = "Role: Porter, Form Automation Specialist";
            const soulPath = path.join(process.cwd(), 'squad', 'porter.md');
            if (fs.existsSync(soulPath)) {
                soul = fs.readFileSync(soulPath, 'utf-8');
            }

            const fullPrompt = `${soul}\n\n---\n\nTask: ${args.prompt}`;

            const response = await runClawdbotInternal(fullPrompt, 'porter-standalone');
            return response;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error('[callPorter] Error:', errorMsg);
            return `⚠️ Porter failed: ${errorMsg}`;
        }
    },
});
