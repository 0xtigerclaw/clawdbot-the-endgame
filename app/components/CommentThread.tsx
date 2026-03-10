"use client";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Send, MessageCircle } from "lucide-react";

interface CommentThreadProps {
    taskId: Id<"tasks">;
}

export default function CommentThread({ taskId }: CommentThreadProps) {
    const messages = useQuery(api.messages.list, { taskId });
    const addMessage = useMutation(api.messages.add);
    const [newComment, setNewComment] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim() || isSubmitting) return;

        setIsSubmitting(true);
        try {
            await addMessage({
                taskId,
                agentName: "User", // Human user
                content: newComment.trim(),
            });
            setNewComment("");
        } finally {
            setIsSubmitting(false);
        }
    };

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        });
    };

    // Highlight @mentions
    const renderContent = (content: string) => {
        const parts = content.split(/(@\w+)/g);
        return parts.map((part, i) => {
            if (part.startsWith("@")) {
                return (
                    <span key={i} className="text-blue-600 font-medium bg-blue-50 px-1 rounded">
                        {part}
                    </span>
                );
            }
            return part;
        });
    };

    // Mention Logic
    const AGENTS = [
        { name: "Tigerclaw", role: "Squad Lead" },
        { name: "Ive", role: "Design" },
        { name: "Ogilvy", role: "Copy" },
        { name: "Porter", role: "Strategy" },
        { name: "Curie", role: "Research" },
        { name: "Torvalds", role: "Engineer" },
        { name: "Tesla", role: "Product" },
        { name: "Kotler", role: "Marketing" },
        { name: "Carnegie", role: "Outreach" },
        { name: "Dewey", role: "Docs" },
    ];

    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionIndex, setMentionIndex] = useState(0);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (mentionQuery !== null) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setMentionIndex(prev => (prev + 1) % filteredAgents.length);
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setMentionIndex(prev => (prev - 1 + filteredAgents.length) % filteredAgents.length);
            } else if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                if (filteredAgents[mentionIndex]) {
                    selectAgent(filteredAgents[mentionIndex].name);
                }
            } else if (e.key === "Escape") {
                setMentionQuery(null);
            }
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setNewComment(val);

        const lastAt = val.lastIndexOf("@");
        if (lastAt !== -1 && lastAt >= val.length - 10) { // Simple check for recent @
            const query = val.slice(lastAt + 1);
            if (!query.includes(" ")) {
                setMentionQuery(query);
                setMentionIndex(0);
                return;
            }
        }
        setMentionQuery(null);
    };

    const filteredAgents = mentionQuery !== null
        ? AGENTS.filter(a => a.name.toLowerCase().startsWith(mentionQuery.toLowerCase()))
        : [];

    const selectAgent = (name: string) => {
        if (mentionQuery === null) return;
        const lastAt = newComment.lastIndexOf("@");
        const prefix = newComment.slice(0, lastAt);
        setNewComment(`${prefix}@${name} `);
        setMentionQuery(null);
    };

    return (
        <div className="border-t border-gray-200 mt-6 pt-6 relative">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <MessageCircle size={14} />
                Comments {messages && messages.length > 0 && `(${messages.length})`}
            </h4>

            {/* Messages List */}
            <div className="space-y-3 mb-4 max-h-64 overflow-y-auto custom-scrollbar">
                {(!messages || messages.length === 0) && (
                    <div className="text-gray-400 text-sm text-center py-4">
                        No comments yet. Use @agent to mention an agent.
                    </div>
                )}
                {messages?.map((msg) => (
                    <div key={msg._id} className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600 shrink-0">
                            {msg.agentName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                                <span className="font-medium text-sm text-gray-800">
                                    {msg.agentName}
                                </span>
                                <span className="text-xs text-gray-400">
                                    {formatTime(msg.timestamp)}
                                </span>
                            </div>
                            <p className="text-sm text-gray-600 mt-0.5 break-words">
                                {renderContent(msg.content)}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Mention Suggestions Popover */}
            {mentionQuery !== null && filteredAgents.length > 0 && (
                <div className="absolute bottom-14 left-0 bg-white border border-gray-200 rounded-lg shadow-xl w-48 overflow-hidden z-10">
                    <div className="bg-gray-50 px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                        Mention Agent
                    </div>
                    {filteredAgents.map((agent, i) => (
                        <button
                            key={agent.name}
                            onClick={() => selectAgent(agent.name)}
                            className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${i === mentionIndex ? 'bg-black text-white' : 'hover:bg-gray-50 text-gray-700'}`}
                        >
                            <span>{agent.name}</span>
                            <span className={`text-[10px] uppercase tracking-wider ${i === mentionIndex ? 'text-gray-300' : 'text-gray-400'}`}>
                                {agent.role}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                    type="text"
                    value={newComment}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Add a comment... (use @agent to mention)"
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                />
                <button
                    type="submit"
                    disabled={!newComment.trim() || isSubmitting}
                    className="px-3 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                    <Send size={16} />
                </button>
            </form>
        </div>
    );
}
