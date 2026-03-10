"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Plus, X, Globe, Tag, Rss, Trash2, ShieldCheck, PlayCircle, ExternalLink } from "lucide-react";
import Link from "next/link";
import { normalizeSourceName } from "../../lib/sourceNames";

type RssSource = {
    _id: Id<"rss_sources">;
    name: string;
    originalUrl?: string;
    url: string;
    resolvedUrl?: string | null;
    category: string;
    lastScrapedAt?: number;
    lastAttemptedAt?: number;
    lastError?: string | null;
    active: boolean;
};

type XSource = {
    _id: Id<"x_sources">;
    name: string;
    username: string;
    category: string;
    lastFetchedAt?: number;
    lastAttemptedAt?: number;
    lastError?: string | null;
    active: boolean;
};

export default function SourceManager({ onClose }: { onClose: () => void }) {
    const [name, setName] = useState("");
    const [url, setUrl] = useState("");
    const [category, setCategory] = useState("AI");
    const [sourceType, setSourceType] = useState<"rss" | "x">("rss");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isTriggering, setIsTriggering] = useState(false);
    const [triggerNotice, setTriggerNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const rssSources = useQuery(api.rss.list, {}) as RssSource[] | undefined;
    const xSources = useQuery(api.x.list, {}) as XSource[] | undefined;

    const addVerifiedRssSource = useAction(api.rssActions.addVerifiedSource);
    const addXSource = useAction(api.xActions.addXSource);
    const removeSource = useMutation(api.rss.remove);
    const toggleActive = useMutation(api.rss.toggleActive);
    const removeXSource = useMutation(api.x.remove);
    const toggleXActive = useMutation(api.x.toggleActive);
    const triggerScout = useAction(api.rssActions.triggerScoutWithData);
    const latestTask = useQuery(api.tasks.getLatestByTitle, { titlePattern: "Scout Scan" });

    const rssCount = rssSources?.length ?? 0;
    const xCount = xSources?.length ?? 0;
    const totalCount = useMemo(() => rssCount + xCount, [rssCount, xCount]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !url.trim()) return;

        setIsSubmitting(true);
        try {
            if (sourceType === "rss") {
                const result = await addVerifiedRssSource({
                    name: name.trim(),
                    url: url.trim(),
                    category: category.trim(),
                });
                const resolvedUrl = (result as { url?: string } | null)?.url;
                if (resolvedUrl && resolvedUrl !== url.trim()) {
                    alert(`Saved as RSS feed:\n${resolvedUrl}`);
                }
            } else {
                const result = await addXSource({
                    name: name.trim(),
                    usernameOrUrl: url.trim(),
                    category: category.trim(),
                });
                const username = (result as { username?: string } | null)?.username;
                if (username) {
                    alert(`Added X source: @${username}\n\nNote: fetching requires X_BEARER_TOKEN to be set on the server.`);
                }
            }
            setName("");
            setUrl("");
        } catch (error) {
            console.error("Failed to add source:", error);
            alert(sourceType === "rss"
                ? "Failed to add source. This URL doesn't appear to expose an RSS/Atom feed."
                : "Failed to add source. Please paste an X profile URL or @handle (e.g. https://x.com/deepmind or @deepmind).");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleTriggerVerification = async () => {
        if (isTriggering) return;
        setIsTriggering(true);
        setTriggerNotice(null);
        try {
            await triggerScout({});
            setTriggerNotice({ type: "success", text: "Scan started — scraping feeds now…" });
            setTimeout(() => setTriggerNotice(null), 6000);
        } catch (error) {
            console.error("Failed to trigger mission:", error);
            setTriggerNotice({ type: "error", text: "Failed to start scan. Make sure sources are active." });
            setTimeout(() => setTriggerNotice(null), 8000);
        } finally {
            setTimeout(() => setIsTriggering(false), 3000);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-100 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div className="flex items-center gap-3">
                        <Rss className="text-blue-500" size={24} />
                        <div>
                            <h2 className="text-xl font-bold">Source Manager</h2>
                            <p className="text-xs text-gray-500 font-medium">Manage RSS intel streams</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">

                    {/* Active Sources List */}
                    <section className="space-y-4">
                        <div className="flex justify-between items-center bg-gray-50/50 p-2 rounded-xl border border-gray-100">
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2 ml-1">
                                <ShieldCheck size={14} className="text-blue-500" />
                                Monitoring ({rssSources?.length || 0})
                            </h3>
	                            <div className="flex items-center gap-2">
	                                {triggerNotice ? (
	                                    <div
	                                        className={`text-[11px] font-semibold px-2 py-1 rounded-lg border ${triggerNotice.type === "success"
	                                            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
	                                            : "bg-red-50 text-red-700 border-red-100"
	                                            }`}
	                                    >
	                                        {triggerNotice.text}
	                                    </div>
	                                ) : null}
	                                {latestTask && (
	                                    <Link
	                                        href={`/mission/${latestTask._id}`}
	                                        className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-white rounded-lg transition-all border border-blue-100 shadow-sm"
                                    >
                                        <ExternalLink size={12} />
                                        VIEW LAST REPORT
                                    </Link>
                                )}
                                <button
                                    onClick={handleTriggerVerification}
                                    disabled={isTriggering}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all shadow-sm ${isTriggering
                                        ? "bg-amber-100 text-amber-600"
                                        : "bg-gray-900 text-white hover:bg-black active:scale-95"
                                        }`}
                                >
                                    {isTriggering ? (
                                        <div className="h-3 w-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <PlayCircle size={14} />
                                    )}
                                    {isTriggering ? "SCRAPING..." : "TRIGGER SCAN"}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                            {rssSources === undefined ? (
                                <div className="text-center py-8 text-gray-400 text-sm italic">Loading intel streams...</div>
                            ) : rssSources.length === 0 ? (
                                <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-100">
                                    <Rss className="mx-auto text-gray-200 mb-2" size={32} />
                                    <p className="text-sm text-gray-400 font-medium">No intel sources added yet</p>
                                </div>
                            ) : (
                                <div className="grid gap-2">
                                    {rssSources.map((source) => (
                                        <div key={source._id} className="flex items-center justify-between p-3 bg-white hover:bg-gray-50 rounded-xl border border-gray-100 transition-all group shadow-sm">
                                            <div className="flex items-center gap-3">
                                                <div className={`h-2 w-2 rounded-full ${source.active ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "bg-gray-300"}`}></div>
                                                <div>
		                                                    <div className="text-sm font-semibold text-gray-900 leading-tight">{normalizeSourceName(source.name, source.category)}</div>
                                                        <div className="text-[10px] text-gray-400 font-mono mt-0.5 uppercase tracking-wider">
                                                            {source.category} • {source.lastScrapedAt
                                                                ? `Last intel: ${new Date(source.lastScrapedAt).toLocaleString()}`
                                                                : source.lastAttemptedAt
                                                                    ? `Last attempt: ${new Date(source.lastAttemptedAt).toLocaleString()}`
                                                                    : "No intel yet"}
                                                            {source.originalUrl && source.originalUrl !== source.url ? " • RESOLVED" : ""}
                                                        </div>
                                                        <div className="text-[10px] text-gray-500 font-mono mt-1 max-w-[420px] truncate" title={source.url}>
                                                            Feed: {source.url}
                                                        </div>
                                                        {source.originalUrl && source.originalUrl !== source.url ? (
                                                            <div className="text-[10px] text-gray-500 font-mono mt-1 max-w-[420px] truncate" title={source.originalUrl}>
                                                                From: {source.originalUrl}
                                                            </div>
                                                        ) : null}
	                                                    {source.lastError ? (
	                                                        <div
	                                                            className="text-[10px] text-red-600 font-medium mt-1 max-w-[420px] truncate"
	                                                            title={source.lastError}
	                                                        >
	                                                            Error: {source.lastError}
	                                                        </div>
	                                                    ) : null}
	                                                </div>
	                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => toggleActive({ id: source._id, active: !source.active })}
                                                    className={`p-1.5 rounded-lg transition-colors ${source.active ? "text-green-600 hover:bg-green-50" : "text-gray-400 hover:bg-gray-100"}`}
                                                    title={source.active ? "Deactivate" : "Activate"}
                                                >
                                                    <ShieldCheck size={16} />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (confirm("Remove this source?")) removeSource({ id: source._id });
                                                    }}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Remove"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>

                    {/* X Sources List */}
                    <section className="space-y-4">
                        <div className="flex justify-between items-center bg-gray-50/50 p-2 rounded-xl border border-gray-100">
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2 ml-1">
                                <ShieldCheck size={14} className="text-blue-500" />
                                X Monitoring ({xSources?.length || 0})
                            </h3>
                        </div>

                        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
                            {xSources === undefined ? (
                                <div className="text-center py-8 text-gray-400 text-sm italic">Loading X sources...</div>
                            ) : xSources.length === 0 ? (
                                <div className="text-center py-10 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-100">
                                    <p className="text-sm text-gray-400 font-medium">No X sources added yet</p>
                                </div>
                            ) : (
                                <div className="grid gap-2">
                                    {xSources.map((source) => (
                                        <div key={source._id} className="flex items-center justify-between p-3 bg-white hover:bg-gray-50 rounded-xl border border-gray-100 transition-all group shadow-sm">
                                            <div className="flex items-center gap-3">
                                                <div className={`h-2 w-2 rounded-full ${source.active ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "bg-gray-300"}`}></div>
                                                <div>
                                                    <div className="text-sm font-semibold text-gray-900 leading-tight">
                                                        {source.name} <span className="text-gray-400 font-mono text-xs">@{source.username}</span>
                                                    </div>
                                                    <div className="text-[10px] text-gray-400 font-mono mt-0.5 uppercase tracking-wider">
                                                        {source.category} • {source.lastFetchedAt
                                                            ? `Last intel: ${new Date(source.lastFetchedAt).toLocaleString()}`
                                                            : source.lastAttemptedAt
                                                                ? `Last attempt: ${new Date(source.lastAttemptedAt).toLocaleString()}`
                                                                : "No intel yet"}
                                                    </div>
                                                    {source.lastError ? (
                                                        <div
                                                            className="text-[10px] text-red-600 font-medium mt-1 max-w-[420px] truncate"
                                                            title={source.lastError}
                                                        >
                                                            Error: {source.lastError}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => toggleXActive({ id: source._id, active: !source.active })}
                                                    className={`p-1.5 rounded-lg transition-colors ${source.active ? "text-green-600 hover:bg-green-50" : "text-gray-400 hover:bg-gray-100"}`}
                                                    title={source.active ? "Deactivate" : "Activate"}
                                                >
                                                    <ShieldCheck size={16} />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (confirm("Remove this X source?")) removeXSource({ id: source._id });
                                                    }}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Remove"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Add New Source Section */}
                    <section className="pt-4 border-t border-gray-100 space-y-4">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 flex items-center gap-2">
                            <Plus className="text-blue-500" size={18} />
                            Add Intel Stream
                        </h3>
                        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Name</label>
                                <div className="relative">
                                    <Tag className="absolute left-3 top-2.5 text-gray-400" size={14} />
                                    <input
                                        required
                                        type="text"
                                        placeholder="Vercel Blog"
                                        className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">
                                    {sourceType === "rss" ? "URL (RSS or Web Page)" : "X Handle or Profile URL"}
                                </label>
                                <div className="relative">
                                    <Globe className="absolute left-3 top-2.5 text-gray-400" size={14} />
                                    <input
                                        required
                                        type={sourceType === "rss" ? "url" : "text"}
                                        placeholder={sourceType === "rss" ? "https://vercel.com/atom" : "https://x.com/deepmind"}
                                        className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium"
                                        value={url}
                                        onChange={(e) => setUrl(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1 md:col-span-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Type & Category</label>
                                <div className="flex gap-2">
                                    <select
                                        className="w-[160px] px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all appearance-none cursor-pointer font-medium"
                                        value={sourceType}
                                        onChange={(e) => setSourceType(e.target.value as "rss" | "x")}
                                    >
                                        <option value="rss">RSS / Web</option>
                                        <option value="x">X (Twitter)</option>
                                    </select>
                                    <select
                                        className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all appearance-none cursor-pointer font-medium"
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value)}
                                    >
                                        <option value="AI">AI & Machine Learning</option>
                                        <option value="Tech">General Tech</option>
                                        <option value="Dev">Developer Tools</option>
                                        <option value="Security">Security</option>
                                        <option value="Business">Business</option>
                                    </select>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting || !name.trim() || !url.trim()}
                                        className="px-6 bg-black text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-800 disabled:opacity-50 transition-all shadow-lg shadow-black/10 active:scale-95 text-sm"
                                    >
                                        {isSubmitting ? "Adding..." : (
                                            <>
                                                <Plus size={16} />
                                                Add
                                            </>
                                        )}
                                    </button>
                                </div>
                                <div className="text-[11px] text-gray-500 mt-2">
                                    Total sources: <span className="font-semibold text-gray-700">{totalCount}</span>
                                </div>
                            </div>
                        </form>
                    </section>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-white text-gray-600 rounded-xl text-sm font-bold border border-gray-200 hover:bg-gray-50 shadow-sm transition-all active:scale-95"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
