"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { spawn } from "child_process";

export const scanForm = action({
    args: {
        url: v.string(),
    },
    handler: async (ctx, args) => {
        console.log(`[scanForm] Starting scan for: ${args.url}`);

        return new Promise((resolve, reject) => {
            // Path to the browser automation script
            // In a real deployment, this would be a separate service or API
            // For local dev, we spawn the script directly
            const scriptPath = './scripts/browserService.ts';

            const child = spawn('npx', ['tsx', scriptPath, '--scan', args.url], {
                env: {
                    ...process.env,
                    // Pass any necessary env vars
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
                console.log(`[scanForm] stderr: ${data}`);
            });

            child.on('close', (code) => {
                if (code !== 0) {
                    console.error(`[scanForm] Failed with code ${code}`);
                    reject(new Error(`Browser scan failed: ${stderr}`));
                    return;
                }

                try {
                    // Script should output JSON result on last line
                    const lines = stdout.trim().split('\n');
                    const lastLine = lines[lines.length - 1];
                    const result = JSON.parse(lastLine);
                    resolve(result);
                } catch (e) {
                    reject(new Error(`Failed to parse scan output: ${stdout}`));
                }
            });
        });
    },
});
