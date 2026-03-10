"use client";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAction } from "convex/react";
import { useState } from "react";
import { User, Code, Search, PenTool, Database, Zap, Layout, Mail, FileText, Linkedin, type LucideIcon } from "lucide-react";

const icons: Record<string, LucideIcon> = {
    Tigerclaw: Zap,
    Tesla: Search,
    Torvalds: Code,
    Curie: Database,
    Porter: Search,
    Ogilvy: PenTool,
    Kotler: PenTool,
    Ive: Layout,
    Carnegie: Mail,
    Dewey: FileText
};

// Team definitions
const teams: Record<string, { name: string; members: string[]; color: string; icon: LucideIcon }> = {
    linkedin: {
        name: "LinkedIn Team",
        members: ["Curie", "Ogilvy", "Carnegie", "Ive"],
        color: "bg-blue-600",
        icon: Linkedin
    }
};

// Skill labels for LinkedIn team
const skillLabels: Record<string, string> = {
    Curie: "Scout",
    Ogilvy: "Writer",
    Carnegie: "Editor",
    Ive: "Visual"
};

type Agent = {
    _id: string;
    name: string;
    role: string;
    status: string;
};

export default function AgentSquad() {
    const agents = useQuery(api.agents.list, {}) as Agent[] | undefined;
    const triggerScoutWithData = useAction(api.rssActions.triggerScoutWithData);
    const [isCurieScanStarting, setIsCurieScanStarting] = useState(false);

    const handleCurieClick = async () => {
        if (isCurieScanStarting) return;
        setIsCurieScanStarting(true);
        try {
            await triggerScoutWithData({});
        } catch (error) {
            console.error("Failed to trigger Curie scan:", error);
            alert("Failed to trigger Curie scan. Please check sources and try again.");
        } finally {
            setTimeout(() => setIsCurieScanStarting(false), 5000);
        }
    };

    if (!agents) return <div className="text-gray-400">Loading squad...</div>;

    // Group agents by team - maintain pipeline order
    const linkedinOrder = ["Curie", "Ogilvy", "Carnegie", "Ive"];
    const linkedinTeam = linkedinOrder
        .map(name => agents.find(a => a.name === name))
        .filter(Boolean) as typeof agents;
    const otherAgents = agents.filter(a => !teams.linkedin.members.includes(a.name));

    return (
        <div className="space-y-6">
            {/* LinkedIn Team */}
            <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4">
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-lg bg-blue-600 text-white">
                        <Linkedin size={16} />
                    </div>
                    <h3 className="font-semibold text-sm text-blue-900">LinkedIn Team</h3>
                    <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full ml-auto">
                        Scout → Writer → Editor → Visual
                    </span>
                </div>
                <div className="grid grid-cols-4 gap-3">
                    {linkedinTeam.map((agent, index) => (
                        <div key={agent._id} className="relative">
                            {(() => {
                                const isCurie = agent.name === "Curie";
                                const isTriggering = isCurie && isCurieScanStarting;
                                const statusIsActive = agent.status === "active" || isTriggering;
                                const cardClass = `p-3 rounded-xl border transition-all ${statusIsActive ? "border-blue-300 bg-white shadow-sm" : "border-blue-100 bg-white/50"} ${isCurie ? "cursor-pointer hover:border-blue-400 hover:shadow-md" : ""}`;
                                const statusLabel = isTriggering ? "triggering scan" : agent.status;

                                return (
                                    <>
                                        {/* Connection arrow */}
                                        {index < linkedinTeam.length - 1 && (
                                            <div className="absolute top-1/2 -right-3 transform -translate-y-1/2 text-blue-300 text-lg z-10">
                                                →
                                            </div>
                                        )}
                                        <div
                                            className={cardClass}
                                            role={isCurie ? "button" : undefined}
                                            tabIndex={isCurie ? 0 : undefined}
                                            onClick={isCurie ? () => void handleCurieClick() : undefined}
                                            onKeyDown={
                                                isCurie
                                                    ? (e) => {
                                                        if (e.key === "Enter" || e.key === " ") {
                                                            e.preventDefault();
                                                            void handleCurieClick();
                                                        }
                                                    }
                                                    : undefined
                                            }
                                            title={isCurie ? "Click to trigger Scout scan" : undefined}
                                        >
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className={`p-2 rounded-lg ${statusIsActive ? "bg-blue-600 text-white" : "bg-blue-100 text-blue-500"}`}>
                                                    {(() => {
                                                        const Icon = icons[agent.name] || User;
                                                        return <Icon size={18} />;
                                                    })()}
                                                </div>
                                                <div>
                                                    <h3 className="font-semibold text-sm text-black">{agent.name}</h3>
                                                    <p className="text-xs text-blue-600">
                                                        {skillLabels[agent.name] || agent.role}
                                                    </p>
                                                    {isCurie && (
                                                        <p className="text-[10px] text-blue-500 font-semibold uppercase tracking-wider mt-0.5">
                                                            {isTriggering ? "Starting scan..." : "Click to trigger scan"}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-1.5 h-1.5 rounded-full ${statusIsActive ? "bg-green-500" : "bg-gray-300"}`} />
                                                <span className="text-xs uppercase tracking-wider text-gray-400 font-medium">{statusLabel}</span>
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    ))}
                </div>
            </div>

            {/* Other Agents */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {otherAgents.map(agent => (
                    <div key={agent._id} className={`p-3 rounded-xl border transition-all ${agent.status === 'active' ? 'border-gray-300 bg-white shadow-sm' : 'border-gray-200 bg-gray-50'}`}>
                        <div className="flex items-center gap-3 mb-2">
                            <div className={`p-2 rounded-lg ${agent.status === 'active' ? 'bg-black text-white' : 'bg-gray-200 text-gray-500'}`}>
                                {(() => {
                                    const Icon = icons[agent.name] || User;
                                    return <Icon size={18} />;
                                })()}
                            </div>
                            <div>
                                <h3 className="font-semibold text-sm text-black">{agent.name}</h3>
                                <p className="text-xs text-gray-500">{agent.role}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${agent.status === 'active' ? 'bg-green-500' : 'bg-gray-300'}`} />
                            <span className="text-xs uppercase tracking-wider text-gray-400 font-medium">{agent.status}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
