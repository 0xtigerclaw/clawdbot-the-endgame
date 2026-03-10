"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Status = {
  now: number;
  pidFileExists: boolean;
  pid: number | null;
  pidRunning: boolean;
  logFileExists: boolean;
  urls: {
    app: string;
    scout: string;
    convex: string;
    convexDashboard: string;
  };
  health: {
    convex: { ok: boolean; status?: number; error?: string };
    convexDashboard: { ok: boolean; status?: number; error?: string };
  };
};

export default function SetupPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/local/status", { cache: "no-store" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      setStatus((await res.json()) as Status);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 text-black font-sans">
      <div className="max-w-3xl mx-auto p-8 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold">Local Setup</h1>
          <p className="text-sm text-gray-600">
            Health checks + quick links for the Clawdbot the Endgame dev stack.
          </p>
        </header>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/"
            className="px-4 py-2 rounded-lg bg-white border border-gray-200 text-sm font-medium hover:bg-gray-100 shadow-sm"
          >
            Open Home
          </Link>
          <Link
            href="/scout"
            className="px-4 py-2 rounded-lg bg-white border border-gray-200 text-sm font-medium hover:bg-gray-100 shadow-sm"
          >
            Open Scout
          </Link>
          <button
            onClick={refresh}
            disabled={isRefreshing}
            className="px-4 py-2 rounded-lg bg-black text-white text-sm font-bold hover:bg-gray-800 disabled:opacity-50 shadow-sm"
          >
            {isRefreshing ? "Refreshing..." : "Refresh Status"}
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="text-sm font-semibold">Stack Status</div>
            <div className="text-xs text-gray-500">
              {status ? new Date(status.now).toLocaleString() : "—"}
            </div>
          </div>

          <div className="p-5 space-y-4 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="text-xs uppercase tracking-wider text-gray-500 font-bold">Runner</div>
                <div className="mt-2">
                  PID file: {status?.pidFileExists ? "present" : "missing"}
                  <br />
                  PID: {status?.pid ?? "—"}
                  <br />
                  Running: {status?.pidRunning ? "yes" : "no"}
                  <br />
                  Log file: {status?.logFileExists ? "present" : "missing"}
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="text-xs uppercase tracking-wider text-gray-500 font-bold">Health</div>
                <div className="mt-2">
                  Convex: {status?.health.convex.ok ? `ok (${status.health.convex.status})` : `down (${status?.health.convex.error || "error"})`}
                  <br />
                  Dashboard: {status?.health.convexDashboard.ok ? `ok (${status.health.convexDashboard.status})` : `down (${status?.health.convexDashboard.error || "error"})`}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div className="text-xs uppercase tracking-wider text-gray-500 font-bold">URLs</div>
              <div className="mt-2 space-y-1">
                <div>
                  App:{" "}
                  <a className="underline" href={status?.urls.app} target="_blank" rel="noreferrer">
                    {status?.urls.app || "—"}
                  </a>
                </div>
                <div>
                  Scout:{" "}
                  <a className="underline" href={status?.urls.scout} target="_blank" rel="noreferrer">
                    {status?.urls.scout || "—"}
                  </a>
                </div>
                <div>
                  Convex:{" "}
                  <a className="underline" href={status?.urls.convex} target="_blank" rel="noreferrer">
                    {status?.urls.convex || "—"}
                  </a>
                </div>
                <div>
                  Convex dashboard:{" "}
                  <a className="underline" href={status?.urls.convexDashboard} target="_blank" rel="noreferrer">
                    {status?.urls.convexDashboard || "—"}
                  </a>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 bg-white p-4">
              <div className="text-xs uppercase tracking-wider text-gray-500 font-bold">One-command run</div>
              <pre className="mt-2 text-xs bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto">
{`cd /path/to/your-cloned-repo
./start.sh --detach
./start.sh status
./start.sh logs`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
