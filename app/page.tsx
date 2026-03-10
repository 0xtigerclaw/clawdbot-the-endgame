"use client";
import AgentSquad from "./components/AgentSquad";
import ActivityFeed from "./components/ActivityFeed";
import TaskBoard from "./components/TaskBoard";
import NewMissionModal from "./components/NewMissionModal";
import { Plus, BookOpen } from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

import { useRouter } from "next/navigation";

export default function Home() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const router = useRouter();

  const systemStatus = useQuery(api.system.getStatus, {});
  const toggleSystemStatus = useMutation(api.system.toggleStatus);
  const isOnline = systemStatus?.status === "online";

  return (
    <div className="min-h-screen p-6 md:p-8 max-w-[1600px] mx-auto space-y-8 font-sans bg-white text-black">

      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b border-gray-200 pb-6 gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-black mb-1">Clawdbot the Endgame</h1>
          <p className="text-gray-500 text-sm">A multi-agent operating system for research, hiring, and structured execution.</p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => router.push("/jobs")}
            className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-full hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <span>🎯</span>
            Jobs
          </button>
          <button
            onClick={() => router.push("/applications")}
            className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-full hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <span>📄</span>
            Applications
          </button>
          <button
            onClick={() => router.push("/setup/email")}
            className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-full hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <span>📬</span>
            Email
          </button>
          <button
            onClick={() => router.push("/skills")}
            className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-full hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <BookOpen size={16} />
            Skills
          </button>
          <button
            onClick={() => router.push("/scout")}
            className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-full hover:bg-gray-50 transition-colors text-sm font-medium text-blue-600"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            Scout
          </button>
          <button
            onClick={() => router.push("/form-filler")}
            className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-full hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <span>📝</span>
            Forms
          </button>
          <button
            onClick={() => toggleSystemStatus()}
            className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all border ${isOnline
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-gray-100 border-gray-200 text-gray-400"
              }`}
          >
            <div className={`w-2 h-2 rounded-full ${isOnline ? "bg-green-500 animate-pulse" : "bg-gray-400"}`}></div>
            <span className="text-sm font-medium">{isOnline ? "Core Online" : "Core Offline"}</span>
          </button>
        </div>
      </header>

      {/* Agents Row */}
      <section>
        <h2 className="font-semibold mb-4 text-gray-400 uppercase tracking-widest text-xs">Active Squad</h2>
        <AgentSquad />
      </section>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

        {/* Task Board (Left - 3 cols) */}
        <section className="lg:col-span-3 h-[calc(100vh-240px)] flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-gray-400 uppercase tracking-widest text-xs">Mission Queue</h2>
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 bg-black text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors"
            >
              <Plus size={16} />
              New Task
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <TaskBoard />
          </div>
        </section>

        {/* Live Feed (Right - 1 col) */}
        <section className="h-[calc(100vh-240px)] flex flex-col">
          <h2 className="font-semibold mb-4 text-gray-400 uppercase tracking-widest text-xs">Activity Feed</h2>
          <div className="flex-1 bg-gray-50 rounded-xl p-4 border border-gray-200 overflow-hidden">
            <ActivityFeed />
          </div>
        </section>

      </div>

      {/* Create Modal */}
      <NewMissionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      {/* Task Details Modal REMOVED - Managed by separate page now */}

    </div >
  );
}
