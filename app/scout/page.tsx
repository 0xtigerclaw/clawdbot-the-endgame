"use client";

import { useQuery, useMutation, useAction } from "convex/react";
// Fixed import path: was "../convex/..." which is wrong from /app/scout
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useMemo, useState } from "react";
import { Check, X, MessageSquare, ArrowLeft, Settings, Clock, Trash2, Sparkles, ChevronDown, Copy } from "lucide-react";
import Link from "next/link";
import SourceManager from "../components/SourceManager";

type LinkStatus = "pending" | "approved" | "rejected";

type ScoutedLink = {
    _id: Id<"scouted_links">;
    url: string;
    title?: string;
    summary?: string;
    agent: string;
    taskId?: Id<"tasks">;
    qualityScore?: number;
    feedback?: string;
    createdAt: number;
};

export default function ScoutDashboard() {
    const [activeTab, setActiveTab] = useState<LinkStatus>("pending");
    const links = useQuery(api.links.listByStatus, { status: activeTab }) as ScoutedLink[] | undefined;
    const reviewLink = useMutation(api.links.reviewLink);
    const addManualLink = useMutation(api.links.addManualLink);
    const clearAllLinks = useMutation(api.links.clearAllLinks);
    const [feedback, setFeedback] = useState<Record<string, string>>({});
    const [newUrl, setNewUrl] = useState("");
    const [showAddSource, setShowAddSource] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const [showLatestBriefing, setShowLatestBriefing] = useState(false);

    const [isScanning, setIsScanning] = useState(false);
    const [scanNotice, setScanNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const triggerScoutWithData = useAction(api.rssActions.triggerScoutWithData);
    const latestTask = useQuery(api.tasks.getLatestByTitle, { titlePattern: "Scout Scan" });
    const linkTaskIds = useMemo(() => {
        if (!links) return [];
        const unique = new Set<string>();
        const ids: Id<"tasks">[] = [];
        for (const link of links) {
            if (!link.taskId) continue;
            const key = String(link.taskId);
            if (unique.has(key)) continue;
            unique.add(key);
            ids.push(link.taskId);
        }
        return ids.slice(0, 50);
    }, [links]);
    const linkTasks = useQuery(api.tasks.getMany, { ids: linkTaskIds }) as
        | Array<{ _id: string; title: string; status: string; selectedOverlayHook?: string }>
        | undefined;
    const linkTaskById = useMemo(() => {
        const map = new Map<string, { _id: string; title: string; status: string; selectedOverlayHook?: string }>();
        for (const t of linkTasks || []) map.set(t._id, t);
        return map;
    }, [linkTasks]);

    const handleClearScreen = async () => {
        if (!confirm(`Are you sure you want to clear all ${activeTab} links?`)) return;
        setIsClearing(true);
        try {
            await clearAllLinks({ status: activeTab });
        } catch (error) {
            console.error("Failed to clear links:", error);
            alert("Failed to clear links.");
        } finally {
            setIsClearing(false);
        }
    };

    const handleTriggerRichScan = async () => {
        if (isScanning) return;
        setIsScanning(true);
        setScanNotice(null);
        try {
            await triggerScoutWithData({});
            setScanNotice({ type: "success", text: "Scan started — fetching feeds now…" });
            setTimeout(() => setScanNotice(null), 6000);
        } catch (error) {
            console.error("Failed to trigger rich scan:", error);
            setScanNotice({ type: "error", text: "Failed to start scan. Check console." });
            setTimeout(() => setScanNotice(null), 8000);
        } finally {
            // Re-enable button after 5s to prevent spam
            setTimeout(() => setIsScanning(false), 5000);
        }
    };

    const handleReview = async (id: Id<"scouted_links">, status: LinkStatus) => {
        await reviewLink({
            id,
            status,
            feedback: feedback[id]
        });
        // Clear local feedback state for this item
        const newFeedback = { ...feedback };
        delete newFeedback[id];
        setFeedback(newFeedback);
    };

    const handleAddLink = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUrl.trim()) return;
        try {
            const raw0 = newUrl.trim();
            const raw = raw0.replace(/^<(.+)>$/, "$1").replace(/^["'](.+)["']$/, "$1").trim();
            const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`;
            const parsed = new URL(withScheme);
            parsed.hash = "";
            const normalized = parsed.toString().replace(/[)\].,;]+$/, "");
            await addManualLink({ url: normalized });
            setNewUrl("");
            setActiveTab("pending"); // Switch to pending to see it
        } catch (err) {
            console.error("Failed to add link:", err);
            const getErrorMessage = (value: unknown): string => {
                if (value && typeof value === "object") {
                    const obj = value as Record<string, unknown>;
                    const direct = obj["message"];
                    if (typeof direct === "string" && direct.trim()) return direct;
                    const data = obj["data"];
                    if (data && typeof data === "object") {
                        const dataObj = data as Record<string, unknown>;
                        const nested = dataObj["message"];
                        if (typeof nested === "string" && nested.trim()) return nested;
                    }
                }
                return "Failed to add link.";
            };
            alert(getErrorMessage(err));
        }
    };

    const formatTime = (ts: number) => {
        const date = new Date(ts);
        return date.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
    };

    const scanSummaryLine = (() => {
        const desc = latestTask?.description || "";
        const match = desc.match(/^\s*Scan summary:\s*.*$/m);
        return match?.[0] || null;
    })();

    const scanLinkData = useMemo(() => {
        const desc = latestTask?.description || "";
        const okUrls: string[] = [];
        const failedFeeds: Array<{ url: string; source?: string; error?: string }> = [];

        let currentSource: string | undefined;
        let inErrorBlock = false;
        let currentError: string | undefined;

        for (const rawLine of desc.split(/\r?\n/)) {
            const line = rawLine.trim();

	            const sourceMatch = line.match(/^##\s*SOURCE:\s*(.+)$/i);
	            if (sourceMatch) {
	                const src = sourceMatch[1] ?? "";
	                currentSource = src;
	                inErrorBlock = src.includes("— ERROR");
	                currentError = undefined;
	                continue;
	            }

            if (inErrorBlock) {
                const feedUrlMatch = line.match(/^-+\s*Feed URL:\s*(https?:\/\/\S+)/i);
                if (feedUrlMatch) {
                    failedFeeds.push({ url: feedUrlMatch[1], source: currentSource, error: currentError });
                    continue;
                }
                const attemptedMatch = line.match(/^-+\s*Attempted:\s*(.+)$/i);
	                if (attemptedMatch) {
	                    const attempted = attemptedMatch[1]
	                        .split(",")
	                        .map((s: string) => s.trim())
	                        .filter((s: string) => s.startsWith("http"));
	                    for (const u of attempted) {
	                        failedFeeds.push({ url: u, source: currentSource, error: currentError });
	                    }
	                    continue;
	                }
                const errLineMatch = line.match(/^-+\s*(.+)$/);
                if (errLineMatch && !errLineMatch[1].toLowerCase().startsWith("feed url:") && !errLineMatch[1].toLowerCase().startsWith("attempted:")) {
                    currentError = errLineMatch[1];
                }
            } else {
                const urlMatch = line.match(/^URL:\s*(https?:\/\/\S+)\s*$/i);
                if (urlMatch) okUrls.push(urlMatch[1]);
            }
        }

        // Fallback: any bare http(s) URLs (deduped later)
        const bareUrlRegex = /(https?:\/\/[^\s)>"']+)/g;
        let b: RegExpExecArray | null;
        while ((b = bareUrlRegex.exec(desc))) {
            okUrls.push(b[1]);
        }

        const cleanOne = (u: string) => u.replace(/[.,;]+$/, "").trim();

        const cleanedOk = okUrls
            .map(u => u.replace(/[.,;]+$/, ""))
            .map(u => u.trim())
            .filter(Boolean);

        const seen = new Set<string>();
        const ok: string[] = [];
        for (const u of cleanedOk) {
            if (seen.has(u)) continue;
            seen.add(u);
            ok.push(u);
        }

        const failed = failedFeeds
            .map((f) => ({ ...f, url: cleanOne(f.url) }))
            .filter((f) => Boolean(f.url));

        // De-dupe failed urls too
        const failedSeen = new Set<string>();
        const failedDeduped: Array<{ url: string; source?: string; error?: string }> = [];
        for (const f of failed) {
            if (failedSeen.has(f.url)) continue;
            failedSeen.add(f.url);
            failedDeduped.push(f);
        }

        // Remove any failed URLs from ok list so they show as red only.
        const failedUrlSet = new Set(failedDeduped.map((f) => f.url));
        const okFiltered = ok.filter((u) => !failedUrlSet.has(u));

        return { ok: okFiltered, failed: failedDeduped };
    }, [latestTask?.description]);

    const copyScanLinks = async () => {
        if (scanLinkData.ok.length === 0) return;
        try {
            await navigator.clipboard.writeText(scanLinkData.ok.join("\n"));
            alert(`Copied ${scanLinkData.ok.length} links.`);
        } catch (e) {
            console.error("Failed to copy links:", e);
            alert("Copy failed. Your browser may have blocked clipboard access.");
        }
    };

    return (
        <div className="min-h-screen p-8 bg-gray-50 text-black font-sans">
            {showAddSource && <SourceManager onClose={() => setShowAddSource(false)} />}

            <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                    <Link
                        href="/"
                        className="p-2 bg-white border border-gray-200 rounded-full hover:bg-gray-100 transition-colors shadow-sm"
                    >
                        <ArrowLeft size={20} />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Scout Intel Feed</h1>
                        <p className="text-gray-500">Review and approve findings for the Writer.</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Manual Link Input */}
                    <form noValidate onSubmit={handleAddLink} className="flex gap-2">
                        <input
                            type="url"
                            placeholder="Drop a URL..."
                            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48 lg:w-64 bg-white shadow-sm"
                            value={newUrl}
                            onChange={(e) => setNewUrl(e.target.value)}
                        />
                        <button
                            type="submit"
                            disabled={!newUrl.trim()}
                            className="px-3 py-2 rounded-lg bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-all active:scale-95"
                        >
                            + Add
                        </button>
                    </form>

                    <div className="h-8 w-px bg-gray-200 mx-1 hidden sm:block"></div>

                    {/* Manage Sources Button */}
                    <button
                        onClick={() => setShowAddSource(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-all shadow-sm"
                    >
                        <Settings size={16} />
                        Sources
                    </button>

                    {/* View Last Report (Promoted) */}
                    {latestTask && (
                        <Link
                            href={`/mission/${latestTask._id}`}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm font-bold hover:bg-blue-100 transition-all shadow-sm group"
                        >
                            <Sparkles size={16} className="group-hover:rotate-12 transition-transform" />
                            VIEW LAST REPORT
                        </Link>
                    )}

                    {/* Scan Button (Updated to use rich trigger) */}
	                    <button
	                        onClick={handleTriggerRichScan}
	                        disabled={isScanning}
	                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border shadow-sm ${isScanning ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed" : "bg-blue-600 text-white border-blue-700 hover:bg-blue-700 active:scale-95 shadow-blue-500/20"}`}
	                    >
	                        <div className={`h-2 w-2 rounded-full ${isScanning ? "bg-gray-400" : "bg-white animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.8)]"}`}></div>
	                        {isScanning ? "SCANNING..." : "TRIGGER SCAN"}
	                    </button>
	                    {scanNotice ? (
	                        <div
	                            className={`text-sm font-medium px-3 py-2 rounded-lg border ${scanNotice.type === "success"
	                                ? "bg-emerald-50 text-emerald-700 border-emerald-100"
	                                : "bg-red-50 text-red-700 border-red-100"
	                                }`}
	                        >
	                            {scanNotice.text}
	                        </div>
	                    ) : null}

	                    {/* Clear Screen Button */}
	                    <button
	                        onClick={handleClearScreen}
                        disabled={isClearing || !links || links.length === 0}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-all shadow-sm disabled:opacity-50 active:scale-95"
                        title={`Clear all ${activeTab} links`}
                    >
                        <Trash2 size={16} />
                        Clear
                    </button>

                    {/* Filter Tabs */}
                    <div className="flex gap-1 bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
                        {(["pending", "approved", "rejected"] as LinkStatus[]).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${activeTab === tab
                                    ? "bg-black text-white shadow-sm"
                                    : "text-gray-500 hover:bg-gray-50"
                                    }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            {/* Latest Scan Briefing (shows the fetched RSS/X intel injected into the mission description) */}
            {latestTask?.description && (
                <div className="mb-8 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <button
                        onClick={() => setShowLatestBriefing(v => !v)}
                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                    >
                        <div className="text-left">
                            <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                                Latest Scan Briefing
                                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                    {latestTask.title}
                                </span>
                                <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                    <Clock size={10} />
                                    {new Date(latestTask._creationTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                </span>
                            </div>
                            <div className="text-xs text-gray-500">
                                {scanSummaryLine || `${scanLinkData.ok.length} ok • ${scanLinkData.failed.length} failed`}
                            </div>
                        </div>
                        <ChevronDown size={18} className={`text-gray-500 transition-transform ${showLatestBriefing ? "rotate-180" : ""}`} />
                    </button>
                    {showLatestBriefing && (
                        <div className="px-5 pb-5">
                            <div className="flex flex-wrap items-center justify-between gap-3 mt-4 mb-3">
                                <div className="text-xs text-gray-500">
                                    Showing visited URLs only
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={copyScanLinks}
                                        disabled={scanLinkData.ok.length === 0}
                                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-800 text-xs font-bold hover:bg-gray-50 disabled:opacity-50 transition-colors"
                                    >
                                        <Copy size={14} />
                                        Copy all
                                    </button>
                                    <Link
                                        href={`/mission/${latestTask._id}`}
                                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-bold hover:bg-black transition-colors"
                                    >
                                        <Sparkles size={14} />
                                        Open report
                                    </Link>
                                </div>
                            </div>

                            {scanLinkData.ok.length === 0 && scanLinkData.failed.length === 0 ? (
                                <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-xl p-4">
                                    No URLs found in the latest scan briefing.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {scanLinkData.failed.length > 0 && (
                                        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                                            <div className="text-[11px] font-black uppercase tracking-widest text-red-700 mb-2">
                                                Failed
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                {scanLinkData.failed.map((f) => (
                                                    <a
                                                        key={f.url}
                                                        href={f.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="block px-3 py-2 rounded-lg border border-red-200 bg-white hover:bg-red-50 transition-colors text-xs font-mono text-red-800 truncate"
                                                        title={[f.url, f.source ? `Source: ${f.source}` : "", f.error ? `Error: ${f.error}` : ""].filter(Boolean).join("\n")}
                                                    >
                                                        {f.url}
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {scanLinkData.ok.length > 0 && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            {scanLinkData.ok.map((url) => (
                                                <a
                                                    key={url}
                                                    href={url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="block px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors text-xs font-mono text-gray-800 truncate"
                                                    title={url}
                                                >
                                                    {url}
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {links === undefined ? (
                    <div className="col-span-full text-center py-12 text-gray-400">Loading intel...</div>
                ) : links.length === 0 ? (
                    <div className="col-span-full text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
                        <p className="text-gray-500">No links found in <strong>{activeTab}</strong>.</p>
                    </div>
                ) : (
                    links.map((link) => (
                        <div key={link._id} className="group bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-all flex flex-col hover:-translate-y-1">
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wide">
                                        {link.agent}
                                    </span>
                                    <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                        <Clock size={10} />
                                        {formatTime(link.createdAt)}
                                    </span>
                                </div>
                                {link.qualityScore && (
                                    <span className={`text-xs font-bold px-2 py-1 rounded ${link.qualityScore >= 8 ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                                        }`}>
                                        QS: {link.qualityScore}
                                    </span>
                                )}
                            </div>

                            <h3 className="font-semibold text-lg leading-tight mb-2 line-clamp-2">
                                <a href={link.url} target="_blank" rel="noopener noreferrer" className="hover:underline decoration-blue-500 underline-offset-2">
                                    {link.title || link.url}
                                </a>
                            </h3>

                            <p className="text-gray-600 text-sm line-clamp-3 mb-4 flex-1">
                                {link.summary || "No summary provided."}
                            </p>

                            {/* Feedback Input (Only for Pending) */}
                            {activeTab === "pending" && (
                                <div className="mt-auto pt-4 border-t border-gray-100 w-full space-y-3">
                                    <div className="relative">
                                        <MessageSquare size={14} className="absolute top-3 left-3 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="Add notes for Writer..."
                                            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/5"
                                            value={feedback[link._id] || ""}
                                            onChange={(e) => setFeedback({ ...feedback, [link._id]: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => handleReview(link._id, "rejected")}
                                            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-red-600 hover:bg-red-50 text-sm font-medium transition-colors"
                                        >
                                            <X size={16} /> Reject
                                        </button>
                                        <button
                                            onClick={() => handleReview(link._id, "approved")}
                                            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-black text-white hover:bg-gray-800 text-sm font-medium transition-colors shadow-lg shadow-black/5"
                                        >
                                            <Check size={16} /> Approve
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Status Display (for non-pending) */}
                            {activeTab !== "pending" && (
                                <div className="mt-auto pt-4 border-t border-gray-100 space-y-2">
                                    <div className="flex items-center justify-between text-xs text-gray-400">
                                        <span>Reviewed</span>
                                        {link.feedback && (
                                            <span className="max-w-[70%] truncate" title={link.feedback}>
                                                Note: {link.feedback}
                                            </span>
                                        )}
                                    </div>

                                    {link.taskId ? (() => {
                                        const task = linkTaskById.get(link.taskId);
                                        const status = task?.status || "unknown";
                                        const needsHook = status === "awaiting_hook";
                                        return (
                                            <div className="flex items-center justify-between gap-3">
                                                <div className={`text-[10px] font-bold px-2 py-1 rounded border ${needsHook
                                                    ? "bg-amber-50 text-amber-800 border-amber-200"
                                                    : "bg-gray-50 text-gray-700 border-gray-200"
                                                    }`}>
                                                    {needsHook ? "Needs hook" : "Task linked"}
                                                </div>
                                                <Link
                                                    href={`/mission/${link.taskId}`}
                                                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${needsHook
                                                        ? "bg-amber-600 text-white hover:bg-amber-700"
                                                        : "bg-gray-900 text-white hover:bg-black"
                                                        }`}
                                                    title={task?.title || "Open task"}
                                                >
                                                    {needsHook ? "Pick hook" : "Open task"}
                                                </Link>
                                            </div>
                                        );
                                    })() : null}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
