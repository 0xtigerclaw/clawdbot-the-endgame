"use client";
import { Trash2 } from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import Link from "next/link";
import { useMemo } from "react";

type Task = {
    _id: string;
    title: string;
    status: "inbox" | "assigned" | "in_progress" | "awaiting_hook" | "review" | "done";
    workflow?: Array<string | string[]>;
    currentStep?: number;
    assignedTo?: string | string[];
};

export default function TaskBoard() {
    const tasks = useQuery(api.tasks.list, {}) as Task[] | undefined;
    const clearDone = useMutation(api.tasks.clearDone);
    const clearByStatus = useMutation(api.tasks.clearByStatus);

    const getColumnLabel = (id: string) => {
        if (id === "awaiting_hook") return "approval/action required";
        return id.replace("_", " ");
    };

    const formatTaskTitle = (title: string) => {
        const raw = (title || "").trim();
        const urlMatch = raw.match(/^(draft content:\s*)(https?:\/\/\S+)$/i);
        if (!urlMatch) return raw;

        try {
            const prefix = urlMatch[1];
            const parsed = new URL(urlMatch[2]);
            const host = parsed.hostname.replace(/^www\./, "");
            const pathParts = parsed.pathname.split("/").filter(Boolean);
            const lastPart = pathParts[pathParts.length - 1] || host;
            const readable = lastPart.replace(/[-_]+/g, " ").trim();
            const shortReadable = readable.length > 56 ? `${readable.slice(0, 56).trimEnd()}…` : readable;
            return `${prefix}${shortReadable} (${host})`;
        } catch {
            return raw;
        }
    };

    const columns = useMemo(() => {
        if (!tasks) return [] as Array<[string, Task[]]>;

        const inbox = tasks.filter(t => t.status === "inbox");
        const working = tasks.filter(t => t.status === "assigned" || t.status === "in_progress");
        const awaitingHook = tasks.filter(t => t.status === "awaiting_hook");
        const review = tasks.filter(t => t.status === "review");
        const done = tasks.filter(t => t.status === "done").reverse();

        const base: Array<[string, Task[]]> = [
            ["working", working],
            ["awaiting_hook", awaitingHook],
            ["review", review],
            ["done", done],
        ];

        return inbox.length > 0 ? ([["inbox", inbox], ...base] as Array<[string, Task[]]>) : base;
    }, [tasks]);

    if (!tasks) return <div className="text-gray-400">Loading...</div>;

    return (
        <div className={`grid ${columns.length > 4 ? "grid-cols-5" : "grid-cols-4"} gap-3 h-full`}>
            {columns.map(([id, items]) => (
                <div key={id} className="bg-gray-50 rounded-xl p-3 flex flex-col h-full max-h-full border border-gray-200 overflow-hidden">
                    <h3 className="uppercase text-xs font-semibold text-gray-400 mb-3 tracking-wider flex justify-between items-center flex-shrink-0">
                        <span className="flex items-center gap-2">
                            {getColumnLabel(id)}
                            <span className="bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full text-xs">{items.length}</span>
                        </span>
                        {(id === "done" || id === "review" || id === "awaiting_hook") && items.length > 0 && (
                            <button
                                onClick={() => id === "done" ? clearDone() : clearByStatus({ status: id })}
                                className="text-gray-400 hover:text-red-500 transition-colors p-1"
                                title="Clear All"
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                    </h3>
                    <div className="space-y-2 overflow-y-auto flex-1 pr-1 custom-scrollbar">
                        {items.length === 0 && (
                            <div className="text-gray-400 text-xs text-center py-4">Empty</div>
                        )}
                        {items.map((task) => (
                            <Link
                                key={task._id}
                                href={`/mission/${task._id}`}
                                className="block bg-white p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer"
                            >
                                <div
                                    className="font-medium mb-1 text-gray-800 text-sm break-words line-clamp-3 leading-6"
                                    title={task.title}
                                >
                                    {formatTaskTitle(task.title)}
                                </div>

                                {/* Workflow Progress */}
                                {task.workflow && task.workflow.length > 0 && (
                                    <div className="flex items-center gap-1.5 mt-2 mb-2">
                                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${task.status === 'review' ? 'bg-purple-500' :
                                                    task.status === 'done' ? 'bg-green-500' :
                                                        task.status === 'awaiting_hook' ? 'bg-amber-500' :
                                                            'bg-black'
                                                    }`}
                                                style={{
                                                    width: task.status === 'review' || task.status === 'done'
                                                        ? '100%'
                                                        : `${Math.min(100, Math.max(5, ((task.currentStep || 0) + 1) / task.workflow.length * 100))}%`
                                                }}
                                            ></div>
                                        </div>
                                        <div className="text-[10px] font-medium text-gray-400 min-w-[35px] text-right">
                                            {task.status === 'review' ? 'Review' :
                                                task.status === 'done' ? 'Done' :
                                                    task.status === 'awaiting_hook' ? 'Pick' :
                                                        `${Math.min((task.currentStep || 0) + 1, task.workflow.length)}/${task.workflow.length}`}
                                        </div>
                                    </div>
                                )}

                                <div className="flex justify-between items-center mt-2">
                                    {task.assignedTo ? (
                                        <div className="flex items-center gap-1.5 text-xs text-gray-700 bg-gray-50 border border-gray-200 px-2 py-1 rounded-md font-medium shadow-sm">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                                            {Array.isArray(task.assignedTo) ? (
                                                <span title={task.assignedTo.join(", ")}>
                                                    @{task.assignedTo.length > 2 ? `Swarm (${task.assignedTo.length})` : task.assignedTo.join(" & ")}
                                                </span>
                                            ) : (
                                                <span>@{task.assignedTo}</span>
                                            )}
                                        </div>
                                    ) : task.status === "awaiting_hook" ? (
                                        <div className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md font-medium shadow-sm">
                                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></div>
                                            Needs hook
                                        </div>
                                    ) : null}
                                    {/* Status Dot */}
                                    <div className={`w-2 h-2 rounded-full ${task.status === 'done' ? 'bg-green-500' :
                                        task.status === 'in_progress' ? 'bg-yellow-500' :
                                            task.status === 'awaiting_hook' ? 'bg-amber-500' :
                                                task.status === 'review' ? 'bg-purple-500' :
                                                    'bg-gray-300'
                                        }`}></div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
