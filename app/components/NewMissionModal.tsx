"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { X, Sparkles, CheckCircle2, Zap } from "lucide-react";
import { clsx } from "clsx";

interface NewMissionModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type AgentRecord = Doc<"agents">;

// Keyword matching logic (mirrors Gateway logic)
const ROLE_KEYWORDS: Record<string, string[]> = {
    "Ogilvy": ["blog", "post", "content", "article", "write", "copy", "text", "draft"],
    "Torvalds": ["code", "bug", "feature", "implement", "fix", "develop", "api", "typescript", "react"],
    "Ive": ["design", "ui", "ux", "mockup", "visual", "brand", "image", "logo", "banner", "graphic", "art"],
    "Porter": ["form", "application", "fill", "accelerator", "yc", "combinator", "apply", "submission"],
    "Carnegie": ["email", "outreach", "campaign", "newsletter", "contact"],
    "Kotler": ["social", "twitter", "linkedin", "tweet", "post", "marketing"],
    "Dewey": ["docs", "documentation", "readme", "guide", "manual"],
    "Curie": ["research", "analyze", "find", "investigate", "study", "report"],
    "Tesla": ["product", "spec", "prd", "roadmap", "features", "requirements"],
};

export default function NewMissionModal({ isOpen, onClose }: NewMissionModalProps) {
    const agents = useQuery(api.agents.list, {});
    const createTask = useMutation(api.tasks.create);

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [isParallel, setIsParallel] = useState(false);

    // Auto-suggest agents based on title
    useEffect(() => {
        if (!title) return;

        const lowerTitle = title.toLowerCase();
        const suggestions = new Set<string>();

        // 1. Check for Agent Name mentions (e.g. "Ive, design this")
        for (const agentName of Object.keys(ROLE_KEYWORDS)) {
            if (lowerTitle.includes(agentName.toLowerCase())) {
                suggestions.add(agentName);
            }
        }

        // 2. keyword matching
        for (const [agent, keywords] of Object.entries(ROLE_KEYWORDS)) {
            if (keywords.some(kw => lowerTitle.includes(kw))) {
                suggestions.add(agent);
            }
        }

        // Default to Tigerclaw if nothing else
        if (suggestions.size === 0 && title.length > 10) {
            // suggesting nothing
        } else if (suggestions.size > 0) {
            // Only auto-select if user hasn't started manually messing with it? 
            // For now, let's just highlight them or have a "Auto-Select" button behavior.
            // Actually, "Lego-like" implies user builds it. Let's provide a "Suggest" button.
        }
    }, [title]);


    const handleSuggest = () => {
        setIsSuggesting(true);
        const lowerTitle = title.toLowerCase() + " " + description.toLowerCase();
        const newSelection = new Set<string>();

        // Always start with a Lead/Manager if complex? No, keep it simple.

        // 1. Explicit Mentions
        for (const agentName of Object.keys(ROLE_KEYWORDS)) {
            if (lowerTitle.includes(agentName.toLowerCase())) {
                newSelection.add(agentName);
            }
        }

        // 2. Keywords
        for (const [agent, keywords] of Object.entries(ROLE_KEYWORDS)) {
            if (keywords.some(kw => lowerTitle.includes(kw))) {
                newSelection.add(agent);
            }
        }

        // If result is empty, maybe Tigerclaw?
        if (newSelection.size === 0) {
            newSelection.add("Tigerclaw");
        }

        setSelectedAgents(Array.from(newSelection));

        setTimeout(() => setIsSuggesting(false), 500); // Visual flair
    };

    const toggleAgent = (agentName: string) => {
        if (selectedAgents.includes(agentName)) {
            setSelectedAgents(selectedAgents.filter(a => a !== agentName));
        } else {
            setSelectedAgents([...selectedAgents, agentName]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;

        let workflow: (string | string[])[] | undefined = undefined;

        if (selectedAgents.length > 0) {
            if (isParallel && selectedAgents.length > 1) {
                // Parallel Mode: All selected agents work together in Step 1, then Tigerclaw reviews
                workflow = [selectedAgents, "Tigerclaw"];
            } else {
                // Sequential Mode: Selected agents -> Tigerclaw
                // Make sure Tigerclaw is last if not already selected
                const flow = [...selectedAgents];
                if (!flow.includes("Tigerclaw")) flow.push("Tigerclaw");
                workflow = flow;
            }
        }

        await createTask({
            title,
            description,
            priority: "medium",
            workflow
        });

        // Reset
        setTitle("");
        setDescription("");
        setSelectedAgents([]);
        setIsParallel(false);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">New Mission</h3>
                        <p className="text-sm text-gray-500">Define objectives and assemble your squad.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
                        <X size={20} />
                    </button>
                </div>

                <div className="overflow-y-auto p-6 space-y-6">

                    {/* Inputs */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Mission Objective</label>
                            <input
                                autoFocus
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="e.g. Design a new landing page for the mobile app..."
                                className="w-full bg-white border border-gray-200 rounded-xl p-3 text-lg font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black transition-all placeholder:text-gray-300"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Additional Context (Optional)</label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                rows={3}
                                placeholder="Paste specs, requirements, or links here..."
                                className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black transition-all placeholder:text-gray-300 resize-none"
                            />
                        </div>
                    </div>

                    {/* Squad Selection */}
                    <div>
                        <div className="flex justify-between items-center mb-3">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                Assemble Squad
                                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                    {selectedAgents.length} Selected
                                </span>
                            </label>

                            <div className="flex items-center gap-4">
                                {/* Parallel Toggle */}
                                {/* Workflow Mode Selector - Simple Toggle */}
                                <button
                                    type="button"
                                    onClick={() => setIsParallel(!isParallel)}
                                    className={clsx(
                                        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border mr-2",
                                        isParallel
                                            ? "border-blue-500/30 bg-blue-50 text-blue-600 shadow-sm"
                                            : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                                    )}
                                >
                                    <Zap size={14} className={clsx(isParallel && "fill-blue-600")} />
                                    Parallel Swarm
                                </button>

                                <button
                                    type="button"
                                    onClick={handleSuggest}
                                    disabled={!title}
                                    className="text-xs flex items-center gap-1.5 text-blue-600 font-semibold hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <Sparkles size={14} className={clsx(isSuggesting && "animate-spin")} />
                                    {isSuggesting ? "Analyzing..." : "Suggest Agents"}
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {agents?.map((agent: AgentRecord) => {
                                const isSelected = selectedAgents.includes(agent.name);
                                return (
                                    <button
                                        key={agent._id}
                                        onClick={() => toggleAgent(agent.name)}
                                        className={clsx(
                                            "flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-200 group relative overflow-hidden",
                                            isSelected
                                                ? "border-black bg-gray-900 text-white shadow-md scale-[1.02]"
                                                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                                        )}
                                    >
                                        <div className={clsx(
                                            "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold transition-colors",
                                            isSelected ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500 group-hover:bg-white group-hover:shadow-sm"
                                        )}>
                                            {agent.name[0]}
                                        </div>
                                        <div>
                                            <div className="font-semibold text-sm">{agent.name}</div>
                                            <div className={clsx("text-xs opacity-70 truncate", isSelected ? "text-gray-300" : "text-gray-400")}>{agent.role}</div>
                                        </div>
                                        {isSelected && (
                                            <div className="absolute top-2 right-2 text-green-400">
                                                <CheckCircle2 size={14} />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {selectedAgents.length === 0 && (
                            <p className="text-xs text-center text-gray-400 mt-3 italic">
                                If minimal agents are selected, Clawdbot the Endgame will auto-assign heavily.
                            </p>
                        )}
                    </div>

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-xl text-gray-600 font-semibold hover:bg-gray-200/50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!title.trim()}
                        className="px-6 py-2.5 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all shadow-lg shadow-black/10 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {selectedAgents.length > 0 ? "Launch Mission" : "Create & Auto-Assign"}
                        <div className="w-5 h-5 flex items-center justify-center bg-white/20 rounded-full text-[10px]">
                            ↵
                        </div>
                    </button>
                </div>

            </div>
        </div>
    );
}
