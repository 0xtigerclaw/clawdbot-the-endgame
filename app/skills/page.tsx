"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, BookOpen, ChevronRight, ArrowLeft } from "lucide-react";

export default function SkillsDashboard() {
    const skills = useQuery(api.skills.list, {});
    const createSkill = useMutation(api.skills.create);
    const router = useRouter();

    const [isCreating, setIsCreating] = useState(false);
    const [newSkillName, setNewSkillName] = useState("");

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSkillName.trim()) return;
        setIsCreating(true);
        try {
            const id = await createSkill({ name: newSkillName });
            router.push(`/skills/${id}`);
        } catch (error) {
            console.error("Failed to create skill:", error);
            setIsCreating(false);
        }
    };

    return (
        <div className="min-h-screen p-6 md:p-8 max-w-[1200px] mx-auto font-sans text-black">
            <header className="flex items-center gap-4 mb-8">
                <button onClick={() => router.push("/")} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Agent Skills</h1>
                    <p className="text-gray-500">Build and define capabilities for your AI squad.</p>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* New Skill Card */}
                <div className="bg-white border-2 border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:border-black transition-colors min-h-[200px]">
                    <form onSubmit={handleCreate} className="w-full max-w-xs space-y-4">
                        <h2 className="font-semibold text-lg">Create New Skill</h2>
                        <input
                            type="text"
                            placeholder="e.g. Khanegi, Copywriting..."
                            value={newSkillName}
                            onChange={(e) => setNewSkillName(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                            autoFocus
                        />
                        <button
                            type="submit"
                            disabled={!newSkillName.trim() || isCreating}
                            className="px-4 py-2 bg-black text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 w-full flex items-center justify-center gap-2"
                        >
                            <Plus size={16} />
                            {isCreating ? "Creating..." : "Create Skill"}
                        </button>
                    </form>
                </div>

                {/* Existing Skills */}
                {skills?.map((skill) => (
                    <div
                        key={skill._id}
                        onClick={() => router.push(`/skills/${skill._id}`)}
                        className="group bg-white border border-gray-200 rounded-xl p-6 cursor-pointer hover:shadow-lg transition-all relative overflow-hidden flex flex-col justify-between min-h-[200px]"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ChevronRight className="text-gray-400" />
                        </div>

                        <div className="space-y-4">
                            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                                <BookOpen size={20} />
                            </div>
                            <h3 className="font-bold text-xl">{skill.name}</h3>
                            <p className="text-sm text-gray-500 line-clamp-2">
                                {skill.description || "No description provided."}
                            </p>
                        </div>

                        <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400 flex justify-between items-center">
                            <span>Updated {new Date(skill.updatedAt).toLocaleDateString()}</span>
                            {skill.generatedMd && (
                                <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Ready</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
