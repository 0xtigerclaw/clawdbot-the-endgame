import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

function isDev() {
  return process.env.NODE_ENV !== "production";
}

async function checkHttp(url: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    return { ok: res.ok, status: res.status };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function GET() {
  if (!isDev()) {
    return NextResponse.json({ error: "Not available in production." }, { status: 404 });
  }

  const runDir = path.join(process.cwd(), ".run");
  const pidFile = path.join(runDir, "dev_all.pid");
  const logFile = path.join(runDir, "dev_all.log");

  let pid: number | null = null;
  let pidRunning = false;

  try {
    const raw = fs.readFileSync(pidFile, "utf8").trim();
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) pid = parsed;
  } catch {
    // ignore
  }

  if (pid) {
    try {
      process.kill(pid, 0);
      pidRunning = true;
    } catch {
      pidRunning = false;
    }
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || "http://127.0.0.1:3210";
  const convexDashboardUrl = "http://127.0.0.1:6790";

  const [convex, dashboard] = await Promise.all([
    checkHttp(convexUrl),
    checkHttp(convexDashboardUrl),
  ]);

  return NextResponse.json({
    now: Date.now(),
    pidFileExists: fs.existsSync(pidFile),
    pid,
    pidRunning,
    logFileExists: fs.existsSync(logFile),
    urls: {
      app: "http://localhost:3000",
      scout: "http://localhost:3000/scout",
      convex: convexUrl,
      convexDashboard: convexDashboardUrl,
    },
    health: {
      convex,
      convexDashboard: dashboard,
    },
  });
}

