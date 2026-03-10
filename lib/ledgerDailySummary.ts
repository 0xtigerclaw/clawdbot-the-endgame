import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

type TaskSnapshot = {
  _id: string;
  _creationTime: number;
  title: string;
  status: string;
  priority?: string;
  assignedTo?: string | string[];
};

type ActivitySnapshot = {
  agentName: string;
  type: string;
  content: string;
  timestamp: number;
};

function clip(value: string, max = 180): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

function assigneeLabel(assignedTo: string | string[] | undefined): string {
  if (!assignedTo) return "unassigned";
  if (Array.isArray(assignedTo)) return assignedTo.join(", ");
  return assignedTo;
}

export function ledgerDateKey(timeZone: string, atMs: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(atMs));
}

export async function buildDeterministicTodaySummary(
  client: ConvexHttpClient,
  timeZone: string,
): Promise<string> {
  const todayKey = ledgerDateKey(timeZone);
  const tasks = (await client.query(api.tasks.list)) as TaskSnapshot[];
  const activity = (await client.query(api.agents.recentActivity, { limit: 500 })) as ActivitySnapshot[];

  const tasksCreatedToday = tasks.filter((task) => ledgerDateKey(timeZone, task._creationTime) === todayKey);
  const todaysActivity = activity.filter((entry) => ledgerDateKey(timeZone, entry.timestamp) === todayKey);

  const statusCounts = tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1;
    return acc;
  }, {});

  const activeWork = tasks
    .filter((task) => ["assigned", "in_progress", "review"].includes(task.status))
    .slice(0, 12)
    .map((task) => `- [${task.status}] ${clip(task.title, 120)} (@${assigneeLabel(task.assignedTo)})`);

  const recentApprovals = todaysActivity
    .filter((entry) => /approved/i.test(entry.content))
    .slice(0, 12)
    .map((entry) => `- ${entry.agentName} (${entry.type}): ${clip(entry.content)}`);

  const recentRisks = todaysActivity
    .filter((entry) => /(error|failed|revision requested|timeout|locked)/i.test(entry.content))
    .slice(0, 12)
    .map((entry) => `- ${entry.agentName} (${entry.type}): ${clip(entry.content)}`);

  const recentSystemEvents = todaysActivity
    .filter((entry) => /(ledger|rss|scout|source|hook|deploy|convex|gateway)/i.test(entry.content))
    .slice(0, 12)
    .map((entry) => `- ${entry.agentName} (${entry.type}): ${clip(entry.content)}`);

  const topCreatedTasks = tasksCreatedToday
    .slice(0, 12)
    .map((task) => `- [${task.status}] ${clip(task.title, 120)} (@${assigneeLabel(task.assignedTo)})`);

  const statusLine = Object.entries(statusCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `${status}:${count}`)
    .join(" | ");

  return [
    "=== DETERMINISTIC TODAY SUMMARY ===",
    `Date (${timeZone}): ${todayKey}`,
    `Total tasks in system: ${tasks.length}`,
    `Status snapshot: ${statusLine || "none"}`,
    `Tasks created today: ${tasksCreatedToday.length}`,
    `Activity events scanned today: ${todaysActivity.length}`,
    "",
    "Tasks created today (top):",
    ...(topCreatedTasks.length > 0 ? topCreatedTasks : ["- none"]),
    "",
    "Active work now:",
    ...(activeWork.length > 0 ? activeWork : ["- none"]),
    "",
    "Recent approvals today:",
    ...(recentApprovals.length > 0 ? recentApprovals : ["- none"]),
    "",
    "Potential risk signals today:",
    ...(recentRisks.length > 0 ? recentRisks : ["- none"]),
    "",
    "Relevant system events today:",
    ...(recentSystemEvents.length > 0 ? recentSystemEvents : ["- none"]),
    "=== END SUMMARY ===",
  ].join("\n");
}

export function buildLedgerUpdateTaskDescription(dateKey: string, summary: string): string {
  return [
    "Objective: capture a deterministic daily snapshot of the project based on today's actual work.",
    "Files and surfaces to review:",
    "- README.md for the public project story",
    "- app/, convex/, gateway/, and services/ for material product changes",
    `- memory/${dateKey}.md if you keep local runtime notes enabled`,
    "",
    summary,
    "",
    "Requirements:",
    "- Use the deterministic summary as primary factual context.",
    "- Validate uncertain items by checking repo files before writing.",
    "- Keep updates factual; do not invent changes.",
    "- If no material changes happened, record a short 'no material updates' entry.",
    "",
    "Debug requirement:",
    "- Emit explicit INPUT/OUTPUT debug activity logs for this task.",
  ].join("\n");
}
