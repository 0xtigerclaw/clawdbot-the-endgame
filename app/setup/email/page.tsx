"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { api } from "../../../convex/_generated/api";

function EmailSetupContent() {
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const integration = useQuery(api.hiring.getEmailIntegration, { provider: "gmail" });
  const signals = useQuery(api.hiring.listInboxSignals, { limit: 20 });
  const snapshots = useQuery(api.hiring.listOptimizationSnapshots, { limit: 5 });
  const pollSignals = useAction(api.hiringActions.pollGmailSignals);
  const setOptimizationApproval = useMutation(api.hiring.setOptimizationApproval);

  const callbackMessage = useMemo(() => {
    if (searchParams.get("connected")) {
      return `Connected Gmail inbox: ${searchParams.get("account") || "account"}`;
    }
    if (searchParams.get("error")) {
      return `OAuth error: ${searchParams.get("error")}`;
    }
    return null;
  }, [searchParams]);

  async function disconnect() {
    setBusy("Disconnecting inbox...");
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/hiring/gmail/disconnect", { method: "POST" });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Failed to disconnect Gmail.");
      }
      setMessage("Gmail integration disconnected.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setBusy(null);
    }
  }

  async function syncInbox() {
    setBusy("Polling Gmail inbox...");
    setMessage(null);
    setError(null);
    try {
      const result = await pollSignals({});
      if (!result.ok) {
        throw new Error(result.reason || "Inbox sync failed.");
      }
      setMessage(`Synced ${result.synced} messages.`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusy(null);
    }
  }

  async function approveSnapshot(snapshotId: string) {
    setBusy("Approving optimization snapshot...");
    setMessage(null);
    setError(null);
    try {
      await setOptimizationApproval({ id: snapshotId as never, approved: true });
      setMessage("Optimization snapshot approved.");
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : String(mutationError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-black">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-gray-500 font-semibold">Feedback Loop</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Gmail Outcome Tracking</h1>
            <p className="mt-2 text-sm text-gray-600 max-w-3xl">
              Connect a read-only Gmail inbox, classify accept and reject messages, and feed the results into weekly tuning snapshots.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/jobs" className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-100">Jobs</Link>
            <Link href="/applications" className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-100">Applications</Link>
            <a href="/api/hiring/gmail/connect" className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">Connect Gmail</a>
            <button onClick={syncInbox} disabled={Boolean(busy) || !integration} className="rounded-full border border-black px-4 py-2 text-sm font-semibold hover:bg-black hover:text-white">Sync Inbox Now</button>
            <button onClick={disconnect} disabled={Boolean(busy) || !integration} className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100">Disconnect</button>
          </div>
        </header>

        {(busy || message || error || callbackMessage) && (
          <div className="space-y-2">
            {busy && <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">{busy}</div>}
            {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
            {callbackMessage && <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">{callbackMessage}</div>}
            {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Integration Status</h2>
            {integration ? (
              <div className="mt-5 space-y-4 text-sm text-gray-700">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Account</div>
                  <div className="mt-2 font-semibold">{integration.accountEmail}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Scopes</div>
                  <div className="mt-2 break-all">{integration.scopes.join(", ")}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Last Polled</div>
                  <div className="mt-2">{integration.lastPolledAt ? new Date(integration.lastPolledAt).toLocaleString() : "Not yet polled"}</div>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
                No active Gmail integration yet.
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Recent Inbox Signals</h2>
            <div className="mt-5 space-y-3">
              {(signals ?? []).map((signal) => (
                <div key={signal._id} className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-700">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold">{signal.subject}</div>
                    <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{signal.classification}</div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">{signal.senderDomain} · {new Date(signal.receivedAt).toLocaleString()}</div>
                  <div className="mt-3">{signal.snippet}</div>
                </div>
              ))}
              {(signals ?? []).length === 0 && <div className="text-sm text-gray-500">No inbox signals recorded yet.</div>}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Weekly Optimization Snapshots</h2>
          <div className="mt-5 space-y-4">
            {(snapshots ?? []).map((snapshot) => (
              <div key={snapshot._id} className="rounded-2xl border border-gray-200 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-sm font-semibold">{new Date(snapshot.periodStart).toLocaleDateString()} - {new Date(snapshot.periodEnd).toLocaleDateString()}</div>
                    <div className="mt-1 text-sm text-gray-600">Sample size: {snapshot.sampleSize}</div>
                    <pre className="mt-4 overflow-x-auto rounded-2xl bg-gray-50 p-4 text-xs text-gray-700">{JSON.stringify(snapshot.summary, null, 2)}</pre>
                  </div>
                  <div className="min-w-[220px] space-y-3">
                    <div className={`rounded-full px-3 py-1 text-xs font-semibold ${snapshot.approved ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      {snapshot.approved ? "Approved" : "Pending approval"}
                    </div>
                    {!snapshot.approved && (
                      <button onClick={() => approveSnapshot(String(snapshot._id))} disabled={Boolean(busy)} className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
                        Approve Snapshot
                      </button>
                    )}
                    <pre className="overflow-x-auto rounded-2xl bg-gray-50 p-4 text-xs text-gray-700">{JSON.stringify(snapshot.recommendedConfig, null, 2)}</pre>
                  </div>
                </div>
              </div>
            ))}
            {(snapshots ?? []).length === 0 && <div className="text-sm text-gray-500">No optimization snapshots generated yet.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function EmailSetupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 text-black" />}>
      <EmailSetupContent />
    </Suspense>
  );
}
