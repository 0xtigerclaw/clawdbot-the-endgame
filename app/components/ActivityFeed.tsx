"use client";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Terminal, Zap, CheckCircle, AlertTriangle, Activity, Play, Power } from "lucide-react";
import { useState } from "react";
import { startGatewayAction, stopGatewayAction } from "../actions";

export default function ActivityFeed() {
    const activities = useQuery(api.agents.recentActivity, {});
    const [isConnected, setIsConnected] = useState(true);

    // Auto-scroll to top (since latest is at top usually, but for console feel maybe we want newest at bottom? 
    // Actually the query sends order("desc"), so newest is top. Let's keep newest at top for a feed.)

    if (!activities) return <div className="text-gray-400 text-sm p-4 text-center">Connecting to Neural Link...</div>;

    const getIcon = (type: string) => {
        switch (type) {
            case 'log': return <Terminal size={14} className="text-gray-400" />;
            case 'action': return <Zap size={14} className="text-blue-400" />;
            case 'success': return <CheckCircle size={14} className="text-green-500" />;
            case 'error': return <AlertTriangle size={14} className="text-red-500" />;
            case 'work': return <Play size={14} className="text-yellow-400" />;
            default: return <Activity size={14} className="text-gray-400" />;
        }
    };

    const getColor = (type: string) => {
        switch (type) {
            case 'error': return 'text-red-200 bg-red-900/10 border-red-900/20';
            case 'success': return 'text-green-200 bg-green-900/10 border-green-900/20';
            case 'action': return 'text-blue-200';
            case 'work': return 'text-yellow-200';
            default: return 'text-gray-300';
        }
    };

    const handleToggleGateway = async () => {
        if (isConnected) {
            const res = await stopGatewayAction();
            if (res.success) setIsConnected(false);
        } else {
            const res = await startGatewayAction();
            if (res.success) setIsConnected(true);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#1e1e1e] rounded-xl border border-gray-800 shadow-inner overflow-hidden font-mono text-xs">
            <div className="bg-[#252526] px-3 py-2 border-b border-gray-800 flex justify-between items-center">
                <span className="text-gray-400 font-semibold flex items-center gap-2">
                    <Terminal size={12} /> LIVE CONSOLE
                </span>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleToggleGateway}
                        className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${isConnected
                            ? "bg-green-900/20 text-green-400 border-green-900/30 hover:bg-green-900/40"
                            : "bg-red-900/20 text-red-400 border-red-900/30 hover:bg-red-900/40"
                            }`}
                        title={isConnected ? "Stop Gateway" : "Start Gateway"}
                    >
                        <Power size={10} />
                        {isConnected ? "ONLINE" : "OFFLINE"}
                    </button>
                    <span className="flex h-2 w-2 relative">
                        {isConnected && <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75"></span>}
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${isConnected ? "bg-green-500" : "bg-red-900"}`}></span>
                    </span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
                {activities.map((log) => (
                    <div key={log._id} className={`flex gap-3 items-start p-1.5 rounded-md hover:bg-white/5 transition-colors border-b border-white/5 ${log.type === 'error' ? 'bg-red-900/20' : ''}`}>
                        <span className="text-gray-500 min-w-[50px] text-[10px] mt-0.5 select-none">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                        </span>

                        <div className="mt-0.5">
                            {getIcon(log.type)}
                        </div>

                        <div className={`flex-1 break-words ${getColor(log.type)}`}>
                            <span className="font-bold text-white/90 mr-2 opacity-80">
                                [{log.agentName?.toUpperCase() || 'SYSTEM'}]
                            </span>
                            <span className="whitespace-pre-wrap">{log.content}</span>
                        </div>
                    </div>
                ))}

                {activities.length === 0 && (
                    <div className="text-center p-8 text-gray-600 italic">
                        {/* No active signals detected. */}
                    </div>
                )}
            </div>
        </div>
    );
}
