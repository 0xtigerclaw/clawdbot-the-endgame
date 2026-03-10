"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { parseMissionReport, cn } from "../../../lib/utils";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CommentThread from "../../components/CommentThread";
import StructuredTabContent from "../../components/StructuredTabContent";
import { ChevronLeft, Plus, Clock, PlayCircle, User, MessageSquare, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState, useRef, useEffect, useMemo } from "react";

// Agent color mapping
const AGENT_COLORS: Record<string, string> = {
    "Tigerclaw": "border-blue-500 bg-blue-50/50",
    "Ive": "border-purple-500 bg-purple-50/50",
    "Ogilvy": "border-teal-500 bg-teal-50/50",
    "Porter": "border-orange-500 bg-orange-50/50",
    "Curie": "border-indigo-500 bg-indigo-50/50",
    "Torvalds": "border-slate-500 bg-slate-50/50",
    "Tesla": "border-red-500 bg-red-50/50",
    "Kotler": "border-pink-500 bg-pink-50/50",
    "Carnegie": "border-yellow-500 bg-yellow-50/50",
    "Dewey": "border-cyan-500 bg-cyan-50/50",
    "System": "border-gray-200 bg-gray-50",
};

const AGENT_AVATARS: Record<string, string> = {
    "Tigerclaw": "👨‍✈️", "Ive": "🎨", "Ogilvy": "✍️", "Porter": "🧠",
    "Curie": "🔬", "Torvalds": "💻", "Tesla": "🚀", "Kotler": "📢",
    "Carnegie": "🤝", "Dewey": "📚", "System": "⚙️"
};

type TaskOutput = {
    stepNumber: number;
    title: string;
    content: string;
    agent: string;
    createdAt: number;
};

type TabData = {
    id?: string;
    label: string;
    content: string;
};

type OverlayHookCandidate = {
    id: string;
    text: string;
    source?: string;
};

export default function MissionDetailPage() {
    const params = useParams<{ id: string | string[] }>();
    const taskId = (Array.isArray(params.id) ? params.id[0] : params.id) as Id<"tasks">; // Cast for Convex ID
    const task = useQuery(api.tasks.get, taskId ? { id: taskId } : "skip");
    const addMessage = useMutation(api.messages.add);
    const selectOverlayHook = useMutation(api.tasks.selectOverlayHook);
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [showComments, setShowComments] = useState(false);
    const [activeOutputTab, setActiveOutputTab] = useState(-1);
    const [tabsCurrentTab, setTabsCurrentTab] = useState(0);
    const [showBriefing, setShowBriefing] = useState(false);
    const [isSelectingHook, setIsSelectingHook] = useState(false);
    const finalOutputRef = useRef<HTMLDivElement>(null);

    const tabsData = useMemo<TabData[] | null>(() => {
        if (!task?.output) return null;
        try {
            // Attempt 1: Direct Parse
            if (task.output.trim().startsWith("{")) {
                const parsed = JSON.parse(task.output) as { tabs?: TabData[] };
                return parsed.tabs || null;
            }

            // Attempt 2: Extract JSON block (Markdown code block or raw JSON pattern)
            const jsonMatch = task.output.match(/```json\n([\s\S]*?)\n```/) || task.output.match(/({[\s\S]*"tabs"[\s\S]*})/);
            if (jsonMatch) {
                const jsonStr = jsonMatch[1] || jsonMatch[0];
                const parsed = JSON.parse(jsonStr) as { tabs?: TabData[] };
                return parsed.tabs || null;
            }

            return null;
        } catch (e) {
            console.error("Failed to parse task output tabs:", e);
            return null;
        }
    }, [task?.output]);

    const agentNameForStructuredTab = useMemo(() => {
        const tab = tabsData?.[tabsCurrentTab];
        if (!tab) return "Agent";
        if (tab.id === "writer") return "Ogilvy";
        if (tab.id === "editor") return "Carnegie";
        if (tab.id === "designer") return "Ive";
        if (tab.id === "recommendations") return "System";
        if (tab.id === "scout") return "Curie";
        if (tab.id === "review") return "Tigerclaw";
        if (tab.id === "trace") return "System";
        const label = tab.label || "";
        const m = label.match(/\(([^)]+)\)/);
        return (m && m[1]) ? m[1] : "Agent";
    }, [tabsData, tabsCurrentTab]);

    // Set default tab to the last output (usually the summary or latest item)
    useEffect(() => {
        if (task && task.outputs && task.outputs.length > 0 && activeOutputTab === -1) {
            setActiveOutputTab(task.outputs.length - 1);
        }
    }, [task, activeOutputTab]);

    useEffect(() => {
        if (tabsData && tabsData.length > 0) {
            setTabsCurrentTab(0);
        }
    }, [tabsData]);

    if (!taskId) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-white gap-4">
                <h1 className="text-xl font-semibold">Mission not found</h1>
                <Link href="/" className="text-sm underline">Return to Headquarters</Link>
            </div>
        );
    }

    if (task === undefined) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="animate-spin w-8 h-8 border-2 border-gray-200 border-t-black rounded-full"></div>
            </div>
        );
    }

    if (task === null) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-white gap-4">
                <h1 className="text-xl font-semibold">Mission not found</h1>
                <Link href="/" className="text-sm underline">Return to Headquarters</Link>
            </div>
        );
    }

    const taskWithHooks = task as unknown as {
        overlayHookCandidates?: Array<string | { id?: string; text?: string; source?: string }>;
        selectedOverlayHook?: string;
        selectedOverlayHookId?: string;
        outputs?: TaskOutput[];
        status: string;
    };
    const overlayHookCandidates: OverlayHookCandidate[] = (taskWithHooks.overlayHookCandidates || [])
        .map((candidate, index) => {
            if (typeof candidate === "string") {
                const text = candidate.trim();
                if (!text) return null;
                return { id: `hook_${index + 1}`, text };
            }
            if (!candidate || typeof candidate !== "object") return null;
            const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
            if (!text) return null;
            const id = typeof candidate.id === "string" && candidate.id.trim()
                ? candidate.id.trim()
                : `hook_${index + 1}`;
            return { id, text, source: candidate.source };
        })
        .filter((candidate): candidate is OverlayHookCandidate => Boolean(candidate));
    const selectedOverlayHook = (taskWithHooks.selectedOverlayHook || "").trim();
    const selectedOverlayHookId = (taskWithHooks.selectedOverlayHookId || "").trim();
    const showFinalPanel = Boolean(tabsData || (taskWithHooks.outputs && taskWithHooks.outputs.length > 0) || (task.status === "done" && task.output));

    const reportBlocks = parseMissionReport(task.output || "");

    // Extract suggestions
    const extractNextSteps = (md: string) => {
        const match = md.match(/### Next Steps([\s\S]*?)(?:$|###)/);
        if (!match) return [];
        return match[1]
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.startsWith('- ') || line.startsWith('* '))
            .map(line => line.replace(/^[-*] /, '').trim())
            .filter(line => line.length > 0)
            .slice(0, 3);
    };

    // Get suggestions from the LAST block's content only to be relevant
    const lastBlock = reportBlocks.length > 0 ? reportBlocks[reportBlocks.length - 1] : null;
    let nextSteps = lastBlock ? extractNextSteps(lastBlock.content) : [];

    // FALLBACK: If no next steps, provide generic ones based on common patterns
    if (nextSteps.length === 0 && task.status === "done") {
        nextSteps = [
            "Write a blog post announcement",
            "Create a thread on X/Twitter",
            "Draft a newsletter update"
        ];
    }

    // Heuristic to guess agent from text
    const guessAgent = (text: string) => {
        const lower = text.toLowerCase();
        if (lower.includes("blog") || lower.includes("post") || lower.includes("article")) return "Ogilvy";
        if (lower.includes("twitter") || lower.includes("tweet") || lower.includes("social") || lower.includes("thread")) return "Kotler";
        if (lower.includes("email") || lower.includes("newsletter")) return "Carnegie";
        if (lower.includes("code") || lower.includes("fix") || lower.includes("implement")) return "Torvalds";
        if (lower.includes("design") || lower.includes("ui") || lower.includes("ux")) return "Ive";
        return "Tigerclaw"; // Default
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans text-black pb-24">

            {/* Navigation Bar */}
            <nav className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4 flex items-center gap-4">
                <Link href="/" className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-black">
                    <ChevronLeft size={20} />
                </Link>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                        <h1 className="text-lg font-bold truncate">{task.title}</h1>
                        <span className={cn(
                            "text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border",
                            task.status === "inbox" && "bg-gray-100 text-gray-600 border-gray-200",
                            task.status === "assigned" && "bg-blue-50 text-blue-600 border-blue-200",
                            task.status === "in_progress" && "bg-amber-50 text-amber-600 border-amber-200 animate-pulse",
                            task.status === "awaiting_hook" && "bg-amber-50 text-amber-700 border-amber-200",
                            task.status === "review" && "bg-purple-50 text-purple-600 border-purple-200",
                            task.status === "done" && "bg-green-50 text-green-600 border-green-200",
                        )}>
                            {task.status.replace("_", " ")}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>ID: {task._id.slice(-8)}</span>
                        <span>•</span>
                        <span>{new Date(task._creationTime).toLocaleDateString()}</span>
                        {task.assignedTo && (
                            <>
                                <span>•</span>
                                <span className="flex items-center gap-1 font-medium text-black">
                                    {task.status === "in_progress" ? <PlayCircle size={10} className="text-amber-500" /> : <User size={10} />}
                                    {task.assignedTo}
                                </span>
                            </>
                        )}
                    </div>
                </div>


            </nav>

            {/* Main Timeline - Wider for Reports */}
            <main className={cn(
                "mx-auto p-6 space-y-8 transition-all duration-500",
                (task.status === "done" || showFinalPanel) ? "max-w-6xl" : "max-w-3xl"
            )}>

                {/* Mission Briefing (shows injected RSS/X intel in description) */}
                {task.description && task.status !== "done" && (
                    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                        <button
                            onClick={() => setShowBriefing(v => !v)}
                            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-gray-900 text-white flex items-center justify-center text-sm font-bold">
                                    📎
                                </div>
                                <div className="text-left">
                                    <div className="text-sm font-semibold text-gray-900">Mission Briefing</div>
                                    <div className="text-xs text-gray-500">Includes fetched RSS/X items used for this run</div>
                                </div>
                            </div>
                            <ChevronDown size={18} className={cn("text-gray-500 transition-transform", showBriefing && "rotate-180")} />
                        </button>
                        {showBriefing && (
                            <div className="px-5 pb-5 prose prose-sm max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {task.description}
                                </ReactMarkdown>
                            </div>
                        )}
                    </div>
                )}

                {/* Outputs panel (shows partial results too; required for hook selection gate) */}
                {showFinalPanel && (
                    <div ref={finalOutputRef} className="rounded-2xl border border-gray-800 bg-[#0f1117] shadow-2xl overflow-hidden ring-1 ring-white/5">
                        {/* Header - Dynamic based on active tab */}
                        {(() => {
                            const outputs = task.outputs || [];
                            const activeOutput = outputs.length > 0 ? outputs[activeOutputTab] : null;

                            // IF we have tabsData (structured synthesis), showing a generic "Mission Report" header is cleaner
                            // because the tabs themselves carry the context.
                            if (tabsData) {
                                return (
                                    <div className="flex items-center gap-4 p-6 bg-gradient-to-r from-emerald-500/20 to-teal-900/20 text-emerald-100 border-b border-white/5">
                                        <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-2xl shadow-inner backdrop-blur-sm border border-white/10">
                                            🏆
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold tracking-tight">Mission Report</h2>
                                            <p className="text-sm opacity-60 font-medium">
                                                {task.status === "done" ? "Final synthesized output" : "Live output"} • {new Date(task._creationTime).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                );
                            }

                            // FALLBACK / LEGACY HEADER LOGIC
                            let headerTitle = "The Endgame";
                            let headerIcon = "🏆";
                            let headerColor = "bg-gradient-to-r from-green-500/20 to-emerald-900/20 text-emerald-100 border-b border-white/5";
                            let subText = outputs.length > 0
                                ? `${outputs.length} step${outputs.length > 1 ? 's' : ''} completed`
                                : 'Consolidated output from all agents';

                            // Dynamic overrides
                            if (activeOutput) {
                                headerTitle = activeOutput.title;
                                const lowerTitle = activeOutput.title.toLowerCase();

                                if (lowerTitle.includes("twitter") || lowerTitle.includes("x post") || lowerTitle.includes("tweet")) {
                                    headerIcon = "🐦";
                                    headerColor = "bg-black text-white border-b border-gray-800";
                                } else if (lowerTitle.includes("linkedin")) {
                                    headerIcon = "💼";
                                    headerColor = "bg-[#0077b5]/10 text-blue-100 border-b border-blue-900/30";
                                } else if (lowerTitle.includes("blog") || lowerTitle.includes("article")) {
                                    headerIcon = "📝";
                                    headerColor = "bg-orange-500/10 text-orange-100 border-b border-orange-900/30";
                                } else if (lowerTitle.includes("email")) {
                                    headerIcon = "📧";
                                    headerColor = "bg-blue-500/10 text-blue-100 border-b border-blue-900/30";
                                } else if (lowerTitle.includes("code")) {
                                    headerIcon = "💻";
                                    headerColor = "bg-slate-800/50 text-slate-100 border-b border-slate-700/50";
                                } else if (lowerTitle.includes("design")) {
                                    headerIcon = "🎨";
                                    headerColor = "bg-purple-600/10 text-purple-100 border-b border-purple-900/30";
                                }

                                subText = `Created by ${activeOutput.agent} • ${new Date(activeOutput.createdAt).toLocaleString()}`;
                            }

                            return (
                                <div className={`flex items-center gap-4 p-6 ${headerColor}`}>
                                    <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-2xl shadow-inner backdrop-blur-sm border border-white/10">
                                        {headerIcon}
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold tracking-tight">{headerTitle}</h2>
                                        <p className="text-sm opacity-60 font-medium">
                                            {subText}
                                        </p>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Tabs for multiple outputs - Centered and Floatier Design */}
                        {(() => {
                            const outputs = (task.outputs || []) as TaskOutput[];
                            const groupedOutputs = new Map<string, number[]>();

                            outputs.forEach((o, idx) => {
                                if (!groupedOutputs.has(o.title)) {
                                    groupedOutputs.set(o.title, []);
                                }
                                groupedOutputs.get(o.title)!.push(idx);
                            });

                            if (outputs.length === 0) return null;

                            // HIDE RAW NAV if we have structured synthesis (tabsData)
                            if (tabsData) return null;

                            const activeOutput = outputs[activeOutputTab];
                            const activeVersions = activeOutput ? groupedOutputs.get(activeOutput.title) || [] : [];

                            // Get accent color based on active output
                            let accentColor = "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
                            const lowerTitle = activeOutput?.title.toLowerCase() || "";
                            if (lowerTitle.includes("twitter") || lowerTitle.includes("x post")) accentColor = "text-white bg-white/10 border-white/20";
                            else if (lowerTitle.includes("linkedin")) accentColor = "text-blue-400 bg-blue-500/10 border-blue-500/20";

                            return (
                                <>
                                    <div className="flex items-center gap-2 px-6 py-4 bg-[#0f1117] border-b border-gray-800 overflow-x-auto">
                                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mr-2">Formats</span>
                                        {Array.from(groupedOutputs.keys()).map((title) => {
                                            const versions = groupedOutputs.get(title)!;
                                            const latestIdx = versions[versions.length - 1]; // Default to latest
                                            const isActive = activeOutput && activeOutput.title === title;

                                            // Determine icon
                                            const icon = title.includes("Blog") ? "📝" :
                                                title.includes("LinkedIn") ? "💼" :
                                                    title.includes("X") ? "🐦" : "📄";

                                            return (
                                                <button
                                                    key={title}
                                                    onClick={() => setActiveOutputTab(latestIdx)}
                                                    className={cn(
                                                        "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full transition-all whitespace-nowrap border",
                                                        isActive
                                                            ? `${accentColor} shadow-[0_0_15px_rgba(0,0,0,0.2)]` // Active state using dynamic accent
                                                            : "bg-transparent text-gray-400 border-gray-800 hover:bg-white/5 hover:text-gray-200"
                                                    )}
                                                >
                                                    <span className="text-lg opacity-80">{icon}</span>
                                                    {title}
                                                    {versions.length > 1 && (
                                                        <span className="bg-gray-800 text-gray-400 text-[10px] h-5 w-5 flex items-center justify-center rounded-full ml-1.5 border border-gray-700">
                                                            {versions.length}
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Version Selector (Sub-nav) */}
                                    {activeVersions.length > 1 && (
                                        <div className="px-8 py-2 bg-black/20 border-b border-gray-800 flex items-center gap-2 text-sm justify-end">
                                            <span className="text-gray-500 font-medium text-xs uppercase tracking-wide mr-2 flex items-center gap-1">
                                                <Clock size={12} /> Versions:
                                            </span>
                                            {activeVersions.map((idx, vIndex) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => setActiveOutputTab(idx)}
                                                    className={cn(
                                                        "px-2.5 py-0.5 rounded text-[11px] font-mono border transition-all",
                                                        activeOutputTab === idx
                                                            ? "bg-white/10 text-white border-white/20 shadow-sm font-bold"
                                                            : "bg-transparent text-gray-600 border-transparent hover:bg-white/5 hover:text-gray-400"
                                                    )}
                                                >
                                                    v{vIndex + 1}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </>
                            );
                        })()}

                        {/* Content - Show active tab or legacy output */}
                        <div className="p-10 md:p-14 min-h-[500px] bg-[#0f1117] text-gray-300">
                            <div className="prose prose-invert prose-lg max-w-none
                                prose-headings:font-bold prose-headings:text-gray-100 prose-headings:tracking-tight
                                prose-h1:text-4xl prose-h1:border-b prose-h1:border-gray-800 prose-h1:pb-6 prose-h1:mb-8
                                prose-h2:text-2xl prose-h2:text-gray-200 prose-h2:mt-12
                                prose-p:leading-relaxed prose-p:text-gray-300
                                prose-li:text-gray-300
                                prose-strong:text-white prose-strong:font-semibold
                                prose-blockquote:border-l-4 prose-blockquote:border-emerald-500/50 prose-blockquote:bg-white/5 prose-blockquote:py-4 prose-blockquote:px-6 prose-blockquote:italic prose-blockquote:text-gray-400 prose-blockquote:rounded-r-lg
                                prose-code:bg-black/40 prose-code:px-2 prose-code:py-1 prose-code:rounded-md prose-code:text-emerald-300 prose-code:font-mono prose-code:text-[0.9em] before:prose-code:content-none after:prose-code:content-none
                                prose-pre:bg-[#000] prose-pre:border prose-pre:border-gray-800 prose-pre:text-gray-200 prose-pre:shadow-xl
                                prose-a:text-emerald-400 prose-a:no-underline hover:prose-a:underline hover:prose-a:text-emerald-300
                                prose-hr:border-gray-800 prose-hr:my-12
                            ">
                                {tabsData ? (
                                    <div className="flex flex-col gap-8">
                                        {/* Tab Navigation */}
                                        <div className="flex gap-1 border-b border-gray-800">
                                            {tabsData.map((tab, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => setTabsCurrentTab(idx)}
                                                    className={cn(
                                                        "px-5 py-3 text-sm font-medium rounded-t-lg transition-all border-b-2 relative top-[1px]",
                                                        tabsCurrentTab === idx
                                                            ? "border-emerald-500 text-emerald-400 bg-emerald-500/5"
                                                            : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5"
                                                    )}
                                                >
                                                    {tab.label}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Tab Content */}
                                        <div className="animate-in fade-in duration-300 slide-in-from-bottom-2">
                                            <StructuredTabContent
                                                content={tabsData[tabsCurrentTab]?.content || ""}
                                                agentName={agentNameForStructuredTab}
                                                activeTabId={tabsData[tabsCurrentTab]?.id}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {task.status === "awaiting_hook"
                                            && ((task.outputs?.[activeOutputTab]?.title || "").toLowerCase().includes("recommendations"))
                                            && overlayHookCandidates.length > 0 && (
                                                <div className="p-6 rounded-2xl border border-amber-500/20 bg-amber-500/5">
                                                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300 mb-4">
                                                        Choose overlay hook (required)
                                                    </div>
                                                    <div className="grid gap-3 md:grid-cols-3">
                                                        {overlayHookCandidates.map((candidate) => {
                                                            const hook = candidate.text;
                                                            const isSelected =
                                                                (selectedOverlayHookId && candidate.id === selectedOverlayHookId)
                                                                || (selectedOverlayHook && hook.toLowerCase() === selectedOverlayHook.toLowerCase());
                                                            return (
                                                                <button
                                                                    key={candidate.id}
                                                                    disabled={isSelectingHook}
                                                                    onClick={async () => {
                                                                        setIsSelectingHook(true);
                                                                        try {
                                                                            await selectOverlayHook({ id: taskId, hook, hookId: candidate.id });
                                                                        } finally {
                                                                            setIsSelectingHook(false);
                                                                        }
                                                                    }}
                                                                    className={cn(
                                                                        "text-left p-4 rounded-2xl border transition-all active:scale-[0.99]",
                                                                        isSelected
                                                                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                                                                            : "border-white/10 bg-white/5 text-gray-200 hover:bg-white/10 hover:border-white/20"
                                                                    )}
                                                                >
                                                                    <div className="text-sm font-black leading-tight">{hook}</div>
                                                                    <div className="text-[10px] text-gray-500 mt-2 uppercase tracking-widest">
                                                                        {isSelected ? "Selected" : "Generate image"}
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                    <div className="mt-4 text-xs text-gray-400">
                                                        After you pick one, Clawdbot the Endgame hands off to Ive and the Designer output appears automatically.
                                                    </div>
                                                </div>
                                            )}

                                        <StructuredTabContent
                                            content={task.outputs && task.outputs.length > 0
                                                ? task.outputs[activeOutputTab]?.content || ''
                                                : task.output || 'No output available'
                                            }
                                            agentName={task.outputs ? task.outputs[activeOutputTab]?.agent : "Agent"}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer with step info */}
                        <div className="px-8 py-4 bg-gray-950/50 border-t border-gray-800 flex justify-between items-center text-xs">
                            <p className="text-gray-600 font-medium tracking-wide uppercase">Clawdbot the Endgame • Secure Transmission</p>
                            {task.outputs && task.outputs.length > 0 && task.outputs[activeOutputTab] && (
                                <div className="flex items-center gap-2 text-gray-500">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    Created by <span className="text-gray-300 font-semibold">{task.outputs[activeOutputTab].agent}</span> • {new Date(task.outputs[activeOutputTab].createdAt).toLocaleString()}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* For IN-PROGRESS tasks: Show the parsed timeline blocks */}
                {task.status !== "done" && !showFinalPanel && reportBlocks.length === 0 && (
                    <div className="text-center py-12 text-gray-400">
                        <div className="w-12 h-12 rounded-full bg-gray-100 mx-auto mb-4 flex items-center justify-center">
                            <Clock size={20} />
                        </div>
                        <p>Mission initiated. Waiting for transmission...</p>
                    </div>
                )}

                {/* For IN-PROGRESS/REVIEW tasks: Show the parsed timeline blocks */}
                {task.status !== "done" && !showFinalPanel && reportBlocks.map((block, i) => (
                    <div
                        key={i}
                        className="flex gap-4 group"
                        ref={i === reportBlocks.length - 1 ? finalOutputRef : null}
                    >
                        <div className="flex flex-col items-center">
                            <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 shadow-sm bg-white z-10",
                                AGENT_COLORS[block.agent]?.split(" ")[0] || "border-gray-200"
                            )}>
                                {AGENT_AVATARS[block.agent] || "🤖"}
                            </div>
                            {i !== reportBlocks.length - 1 && (
                                <div className="w-0.5 flex-1 bg-gray-200 my-2 group-hover:bg-gray-300 transition-colors"></div>
                            )}
                        </div>

                        <div className={cn(
                            "flex-1 rounded-2xl border p-5 shadow-sm transition-all hover:shadow-md",
                            AGENT_COLORS[block.agent] || "bg-white border-gray-200"
                        )}>
                            <div className="flex justify-between items-start mb-4 border-b border-black/5 pb-3">
                                <div>
                                    <h3 className="font-bold text-sm">{block.agent}</h3>
                                    <p className="text-xs opacity-60 font-medium">{block.role}</p>
                                </div>
                            </div>

                            <div className="report-content prose prose-sm max-w-none prose-p:leading-relaxed prose-headings:text-black/80 prose-a:text-blue-600">
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        img: ({ src, alt }) => (
                                            <span className="block my-4 rounded-xl overflow-hidden border border-black/10 shadow-sm bg-white">
                                                <img
                                                    src={src}
                                                    alt={alt || "Agent Visual"}
                                                    className="w-full max-h-[500px] object-contain bg-[url('/transparent-grid.png')]"
                                                // onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                />
                                                {alt && <span className="block text-xs text-black/50 p-2 bg-gray-50/50 text-center border-t border-black/5">{alt}</span>}
                                            </span>
                                        ),
                                    }}
                                >
                                    {block.content}
                                </ReactMarkdown>
                            </div>
                        </div>
                    </div>
                ))}

            </main>

            {/* Footer Interaction Area */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-20">

                {/* Collapsible Comments Panel */}
                {showComments && (
                    <div className="border-b border-gray-100 bg-gray-50/50 max-h-[60vh] overflow-y-auto">
                        <div className="max-w-3xl mx-auto p-4">
                            <CommentThread taskId={taskId} />
                        </div>
                    </div>
                )}

                {/* Always Visible Control Bar */}
                <div className={cn(
                    "mx-auto p-4 flex flex-col gap-3 transition-all duration-500",
                    (task.status === "done" || showFinalPanel) ? "max-w-6xl" : "max-w-3xl"
                )}>

                    <div className="flex justify-between items-center">
                        {/* Left: Suggestions (if any) */}
                        <div className="flex-1 flex gap-2 overflow-x-auto scrollbar-none mr-4">
                            {nextSteps.map((step, k) => {
                                const agent = guessAgent(step);
                                return (
                                    <button
                                        key={k}
                                        disabled={isSuggesting}
                                        onClick={async () => {
                                            setIsSuggesting(true);
                                            try {
                                                await addMessage({
                                                    taskId: task._id,
                                                    agentName: "User",
                                                    content: `@${agent} [Next Step] ${step}`
                                                });
                                                // Optional: Scroll to bottom after adding
                                            } finally {
                                                setIsSuggesting(false);
                                            }
                                        }}
                                        className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors disabled:opacity-50"
                                    >
                                        {isSuggesting ? <span className="animate-spin text-xs">⏳</span> : <Plus size={14} />}
                                        <span className="opacity-70 font-normal">@{agent}</span>
                                        {step}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Right: Comment Toggle */}
                        <button
                            onClick={() => setShowComments(!showComments)}
                            className={cn(
                                "flex-shrink-0 flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border",
                                showComments
                                    ? "bg-gray-100 text-gray-700 border-gray-200"
                                    : "bg-black text-white border-black hover:bg-gray-800"
                            )}
                        >
                            {showComments ? <ChevronDown size={14} /> : <MessageSquare size={14} />}
                            {showComments ? "Hide Comments" : "Comments"}
                        </button>
                    </div>

                </div>
            </div>

        </div>
    );
}
