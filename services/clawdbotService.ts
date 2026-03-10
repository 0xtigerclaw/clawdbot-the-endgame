/**
 * Clawdbot HTTP Wrapper for Convex Actions
 * 
 * This service provides an HTTP endpoint that Convex actions can call
 * to use clawdbot for OpenAI requests, avoiding direct API calls and quota issues.
 */

import express from 'express';
import { spawn } from 'child_process';

const app = express();
app.use(express.json());

interface ClawdbotRequest {
    message: string;
    sessionId?: string;
}

interface ClawdbotResponse {
    text: string;
    success: boolean;
    error?: string;
}

async function runClawdbot(message: string, sessionId: string = 'porter-agent'): Promise<string> {
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
                console.error(`[Clawdbot Service] Exit code ${code}`);
                console.error(`[Clawdbot Service] Stderr: ${stderr}`);
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

// Endpoint for Convex actions to call
app.post('/api/clawdbot', async (req, res) => {
    const { message, sessionId }: ClawdbotRequest = req.body;

    if (!message) {
        return res.status(400).json({
            success: false,
            error: 'Message is required'
        });
    }

    try {
        const text = await runClawdbot(message, sessionId);
        res.json({
            success: true,
            text
        } as ClawdbotResponse);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[Clawdbot Service] Error:', errorMessage);
        res.status(500).json({
            success: false,
            error: errorMessage
        } as ClawdbotResponse);
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'clawdbot-proxy' });
});

const PORT = process.env.CLAWDBOT_SERVICE_PORT || 3001;

app.listen(PORT, () => {
    console.log(`🤖 Clawdbot HTTP Service running on port ${PORT}`);
    console.log(`   Convex actions can call: http://localhost:${PORT}/api/clawdbot`);
});

export default app;
