import cron from 'node-cron';
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { logToDaily } from "../services/memory";
import * as dotenv from "dotenv";
import {
    buildDeterministicTodaySummary,
    buildLedgerUpdateTaskDescription,
    ledgerDateKey,
} from "../lib/ledgerDailySummary";
dotenv.config({ path: ".env.local" });

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const DAILY_SUMMARY_CRON_SCHEDULES = (
    process.env.DAILY_SUMMARY_CRONS
    || process.env.DAILY_SUMMARY_CRON
    || "0 15 * * *,0 21 * * *"
)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
const DAILY_SUMMARY_TIMEZONE = process.env.DAILY_SUMMARY_TIMEZONE || "Europe/Amsterdam";

interface HeartbeatConfig {
    agentName: string;
    cronSchedule: string; // cron expression
}

// Staggered heartbeat schedule (every 15 minutes, offset by agent)
const heartbeatSchedules: HeartbeatConfig[] = [
    { agentName: "Tigerclaw", cronSchedule: "0,15,30,45 * * * *" },   // Every 15 min
    { agentName: "Tesla", cronSchedule: "1,16,31,46 * * * *" },    // Offset by 1 min
    { agentName: "Torvalds", cronSchedule: "2,17,32,47 * * * *" },
    { agentName: "Curie", cronSchedule: "3,18,33,48 * * * *" },
    { agentName: "Porter", cronSchedule: "4,19,34,49 * * * *" },
    { agentName: "Ogilvy", cronSchedule: "5,20,35,50 * * * *" },
    { agentName: "Kotler", cronSchedule: "6,21,36,51 * * * *" },
    { agentName: "Ive", cronSchedule: "7,22,37,52 * * * *" },
    { agentName: "Carnegie", cronSchedule: "8,23,38,53 * * * *" },
    { agentName: "Dewey", cronSchedule: "9,24,39,54 * * * *" },
];

async function executeHeartbeat(agentName: string) {
    console.log(`[HEARTBEAT] ${agentName} waking up...`);

    try {
        // 1. Check for undelivered notifications
        const notifications = await client.query(api.notifications.getUndelivered, { agentName });

        if (notifications.length > 0) {
            console.log(`[HEARTBEAT] ${agentName} has ${notifications.length} unread notifications`);

            // Log notification receipt to activity feed
            for (const notif of notifications) {
                await client.mutation(api.agents.logActivity, {
                    agentName,
                    type: "notification",
                    content: `📬 ${notif.type}: ${notif.content}`,
                });
            }

            // Mark all as delivered
            await client.mutation(api.notifications.markAllDelivered, { agentName });
            console.log(`[HEARTBEAT] ${agentName} notifications delivered and marked.`);
        }

        // 2. Check for unassigned tasks
        const allTasks = await client.query(api.tasks.list, {});
        const inboxTasks = allTasks.filter(t => t.status === "inbox");

        if (agentName === "Tigerclaw" && inboxTasks.length > 0) {
            // Tigerclaw assigns tasks
            console.log(`[HEARTBEAT] Tigerclaw found ${inboxTasks.length} unassigned tasks`);
            await client.mutation(api.agents.logActivity, {
                agentName: "Tigerclaw",
                type: "heartbeat",
                content: `Found ${inboxTasks.length} tasks in inbox. Initiating assignment...`,
            });
        } else {
            // Regular heartbeat
            await client.mutation(api.agents.logActivity, {
                agentName,
                type: "heartbeat",
                content: "HEARTBEAT_OK",
            });
        }

        // Log to daily notes
        logToDaily(agentName, "Heartbeat", "Periodic wakeup completed.");

    } catch (error) {
        console.error(`[HEARTBEAT] Error for ${agentName}:`, error);
    }
}

async function scheduleDailyLedgerUpdateTask(): Promise<void> {
    const dateKey = ledgerDateKey(DAILY_SUMMARY_TIMEZONE);
    const title = `Daily System Snapshot - ${dateKey}`;

    try {
        const tasks = await client.query(api.tasks.list, {});
        const alreadyExists = (tasks as Array<{ title: string }>).some((task) => task.title === title);
        if (alreadyExists) {
            console.log(`[LEDGER] Task already exists for ${dateKey}, skipping.`);
            return;
        }

        const summary = await buildDeterministicTodaySummary(client, DAILY_SUMMARY_TIMEZONE);
        const description = buildLedgerUpdateTaskDescription(dateKey, summary);

        await client.mutation(api.tasks.create, {
            title,
            description,
            priority: "high",
            workflow: ["Dewey"],
        });

        await client.mutation(api.agents.logActivity, {
            agentName: "Tigerclaw",
            type: "action",
            content: `Scheduled ${title} for Dewey`,
        });
        await client.mutation(api.agents.logActivity, {
            agentName: "Tigerclaw",
            type: "debug",
            content: `[LEDGER_TASK_INPUT]\n${description.slice(0, 3500)}`,
        });

        logToDaily("Tigerclaw", "Scheduled Task", `Created: ${title}`);
        console.log(`[LEDGER] Created scheduled task: ${title}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[SUMMARY] Failed to schedule daily system snapshot:", message);
    }
}

async function pollHiringInboxSignals(): Promise<void> {
    try {
        const result = await client.action(api.hiringActions.pollGmailSignals, {});
        console.log("[HIRING] Gmail inbox poll complete:", result);
    } catch (error) {
        console.error("[HIRING] Gmail inbox poll failed:", error);
    }
}

async function createWeeklyOptimizationSnapshot(): Promise<void> {
    try {
        const result = await client.action(api.hiringActions.proposeWeeklyOptimization, {});
        console.log("[HIRING] Weekly optimization snapshot created:", result);
    } catch (error) {
        console.error("[HIRING] Weekly optimization snapshot failed:", error);
    }
}

export function startScheduler() {
    console.log("[SCHEDULER] Initializing agent heartbeats...");

    for (const config of heartbeatSchedules) {
        cron.schedule(config.cronSchedule, () => {
            executeHeartbeat(config.agentName);
        });
        console.log(`[SCHEDULER] Scheduled ${config.agentName}: ${config.cronSchedule}`);
    }

    for (const schedule of DAILY_SUMMARY_CRON_SCHEDULES) {
        cron.schedule(
            schedule,
            () => {
            console.log("[SCHEDULER] Running scheduled daily system snapshot task...");
            scheduleDailyLedgerUpdateTask();
            },
            { timezone: DAILY_SUMMARY_TIMEZONE },
        );
        console.log(`[SCHEDULER] Scheduled daily system snapshot: ${schedule} (${DAILY_SUMMARY_TIMEZONE})`);
    }

    cron.schedule(
        "0 8-20/2 * * *",
        () => {
            console.log("[SCHEDULER] Running Gmail hiring inbox poll...");
            pollHiringInboxSignals();
        },
        { timezone: "Europe/Amsterdam" },
    );
    console.log("[SCHEDULER] Scheduled Gmail hiring inbox poll: 0 8-20/2 * * * (Europe/Amsterdam)");

    cron.schedule(
        "0 19 * * 0",
        () => {
            console.log("[SCHEDULER] Running weekly hiring optimization snapshot...");
            createWeeklyOptimizationSnapshot();
        },
        { timezone: "Europe/Amsterdam" },
    );
    console.log("[SCHEDULER] Scheduled weekly hiring optimization snapshot: 0 19 * * 0 (Europe/Amsterdam)");

    console.log("[SCHEDULER] All heartbeats scheduled. Agents will wake up periodically.");
}

// Check for @mentions in activity feed
export async function checkMentions(): Promise<void> {
    const activities = await client.query(api.agents.recentActivity, {});

    for (const activity of activities) {
        // Look for @mentions pattern
        const mentionMatch = activity.content.match(/@(\w+)/g);
        if (mentionMatch) {
            for (const mention of mentionMatch) {
                const mentionedAgent = mention.replace("@", "");
                console.log(`[MENTION] Detected mention of ${mentionedAgent}`);

                await client.mutation(api.agents.logActivity, {
                    agentName: mentionedAgent,
                    type: "notification",
                    content: `You were mentioned: "${activity.content}"`,
                });
            }
        }
    }
}
