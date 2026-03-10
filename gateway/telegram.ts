import TelegramBot from 'node-telegram-bot-api';
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { generateAgentResponse } from "../services/llm";
import { logToDaily } from "../services/memory";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Agent name mapping
const agentNames = ["tigerclaw", "tesla", "torvalds", "curie", "porter", "ogilvy", "kotler", "ive", "carnegie", "dewey"];
function parseAgentMention(text: string): { agent: string | null; task: string } {
    const mentionMatch = text.match(/^@?(\w+)\s+(.+)/i);
    if (mentionMatch) {
        const potentialAgent = mentionMatch[1].toLowerCase();
        if (agentNames.includes(potentialAgent)) {
            return { agent: potentialAgent, task: mentionMatch[2] };
        }
    }
    return { agent: null, task: text };
}

// Get agent info from database
async function getAgentByName(name: string) {
    const agents = await client.query(api.agents.list, {});
    return agents.find(a => a.name.toLowerCase() === name.toLowerCase());
}

export function startTelegramBot() {
    if (!TELEGRAM_TOKEN) {
        console.error("[TELEGRAM] No bot token found! Set TELEGRAM_BOT_TOKEN in .env.local");
        return;
    }

    const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
    console.log("[TELEGRAM] Bot started! Listening for messages...");

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;

        if (!text) return;

        // Parse the message for agent mentions
        const { agent: requestedAgent, task } = parseAgentMention(text);

        try {
            // If specific agent requested
            if (requestedAgent) {
                const agent = await getAgentByName(requestedAgent);
                if (!agent) {
                    await bot.sendMessage(chatId, `❌ Agent "${requestedAgent}" not found.`);
                    return;
                }

                await bot.sendMessage(chatId, `🤖 ${agent.name} is working on your request...`);

                // Generate response
                const response = await generateAgentResponse(agent.name, agent.role || "Generalist", task);

                // Log to memory
                logToDaily(agent.name, "Telegram Task", `Received from Telegram: "${task}"`);

                // Send response (split if too long)
                if (response.length > 4000) {
                    const chunks = response.match(/.{1,4000}/g) || [];
                    for (const chunk of chunks) {
                        await bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
                    }
                } else {
                    await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
                }

                // Log activity
                await client.mutation(api.agents.logActivity, {
                    agentName: agent.name,
                    type: "telegram",
                    content: `Responded to Telegram: "${task.substring(0, 50)}..."`,
                });

            } else {
                // No specific agent - route to Tigerclaw (Squad Lead)
                const tigerclaw = await getAgentByName("tigerclaw");
                if (!tigerclaw) {
                    await bot.sendMessage(chatId, "❌ Squad not initialized. Start the Gateway first.");
                    return;
                }

                await bot.sendMessage(chatId, "🎯 Tigerclaw is reviewing your request...");

                const response = await generateAgentResponse("Tigerclaw", "Squad Lead", task);

                logToDaily("Tigerclaw", "Telegram Task", `Received from Telegram: "${task}"`);

                if (response.length > 4000) {
                    const chunks = response.match(/.{1,4000}/g) || [];
                    for (const chunk of chunks) {
                        await bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
                    }
                } else {
                    await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
                }

                await client.mutation(api.agents.logActivity, {
                    agentName: "Tigerclaw",
                    type: "telegram",
                    content: `Responded to Telegram: "${task.substring(0, 50)}..."`,
                });
            }
        } catch (error) {
            console.error("[TELEGRAM] Error processing message:", error);
            await bot.sendMessage(chatId, "❌ An error occurred. Check the Gateway logs.");
        }
    });

    bot.on('polling_error', (error) => {
        console.error("[TELEGRAM] Polling error:", error);
    });

    return bot;
}
