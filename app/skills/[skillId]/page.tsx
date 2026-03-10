"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Upload, Link, FileText, Trash2, Zap, Download, BookOpen } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function SkillEditor() {
    const params = useParams<{ skillId: string | string[] }>();
    const router = useRouter();
    const skillId = Array.isArray(params.skillId) ? params.skillId[0] : params.skillId;
    const typedSkillId = skillId as Id<"skills"> | undefined;

    const skill = useQuery(api.skills.get, typedSkillId ? { id: typedSkillId } : "skip");
    const resources = useQuery(api.skills.getResources, typedSkillId ? { skillId: typedSkillId } : "skip");

    const generateUploadUrl = useMutation(api.files.generateUploadUrl);
    const addResource = useMutation(api.skills.addResource);
    const deleteResource = useMutation(api.skills.deleteResource);
    const generateSkill = useAction(api.skillActions.generate);

    const [activeTab, setActiveTab] = useState<"upload" | "link" | "text">("upload");
    const [isGenerating, setIsGenerating] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    // Form States
    const [linkUrl, setLinkUrl] = useState("");
    const [linkTitle, setLinkTitle] = useState("");
    const [textContent, setTextContent] = useState("");
    const [textTitle, setTextTitle] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!skill) return <div className="p-8">Loading skill...</div>;

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            // 1. Get URL
            const postUrl = await generateUploadUrl();

            // 2. Upload
            const result = await fetch(postUrl, {
                method: "POST",
                headers: { "Content-Type": file.type },
                body: file,
            });
            const { storageId } = await result.json();

            // 3. Save Resource
            await addResource({
                skillId: typedSkillId as Id<"skills">,
                type: "pdf",
                title: file.name,
                storageId,
            });

        } catch (error) {
            console.error("Upload failed", error);
            alert("Upload failed");
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleAddLink = async () => {
        if (!linkUrl || !linkTitle) return;
        await addResource({
            skillId: typedSkillId as Id<"skills">,
            type: "link",
            title: linkTitle,
            url: linkUrl,
        });
        setLinkUrl("");
        setLinkTitle("");
    };

    const handleAddText = async () => {
        if (!textContent || !textTitle) return;
        await addResource({
            skillId: typedSkillId as Id<"skills">,
            type: "text",
            title: textTitle,
            textContent,
        });
        setTextContent("");
        setTextTitle("");
    };

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            await generateSkill({ skillId: typedSkillId as Id<"skills"> });
        } catch (error) {
            console.error("Generation failed", error);
            alert("Generation failed. Check console.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDownload = () => {
        if (!skill.generatedMd) return;
        const blob = new Blob([skill.generatedMd], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${skill.name.toLowerCase().replace(/\s+/g, '-')}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen p-6 md:p-8 max-w-[1400px] mx-auto font-sans text-black grid grid-cols-1 lg:grid-cols-2 gap-8">

            {/* LEFT COLUMN: Resources */}
            <div className="space-y-8">
                <header className="flex items-center gap-4">
                    <button onClick={() => router.push("/skills")} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">{skill.name}</h1>
                        <p className="text-gray-500">Manage resources and generate definition.</p>
                    </div>
                </header>

                {/* Resource List */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="p-4 bg-gray-50 border-b border-gray-200 font-semibold text-sm text-gray-700 flex justify-between items-center">
                        <span>Knowledge Base ({resources?.length || 0})</span>
                    </div>
                    <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                        {resources?.length === 0 && (
                            <div className="p-8 text-center text-gray-400 text-sm">
                                No resources added yet. Add PDFs, Links, or Notes below.
                            </div>
                        )}
                        {resources?.map((res) => (
                            <div key={res._id} className="p-4 flex items-center justify-between group hover:bg-gray-50">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-gray-100 rounded-lg text-gray-500">
                                        {res.type === "pdf" ? <FileText size={18} /> : res.type === "link" ? <Link size={18} /> : <BookOpen size={18} />}
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-sm">{res.title}</h4>
                                        <p className="text-xs text-gray-500 uppercase">{res.type}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => deleteResource({ id: res._id })}
                                    className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Add Resource Form */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
                    <h3 className="font-semibold text-lg">Add Resource</h3>

                    <div className="flex gap-4 border-b border-gray-200">
                        <button
                            onClick={() => setActiveTab("upload")}
                            className={`pb-2 px-1 text-sm font-medium transition-colors ${activeTab === "upload" ? "border-b-2 border-black text-black" : "text-gray-400 hover:text-gray-600"}`}
                        >
                            Upload PDF
                        </button>
                        <button
                            onClick={() => setActiveTab("link")}
                            className={`pb-2 px-1 text-sm font-medium transition-colors ${activeTab === "link" ? "border-b-2 border-black text-black" : "text-gray-400 hover:text-gray-600"}`}
                        >
                            Add Link
                        </button>
                        <button
                            onClick={() => setActiveTab("text")}
                            className={`pb-2 px-1 text-sm font-medium transition-colors ${activeTab === "text" ? "border-b-2 border-black text-black" : "text-gray-400 hover:text-gray-600"}`}
                        >
                            Text Note
                        </button>
                    </div>

                    {activeTab === "upload" && (
                        <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                className="hidden"
                                accept="application/pdf"
                            />
                            <Upload className="text-gray-400 mb-2" size={32} />
                            <p className="text-sm font-medium text-gray-700">
                                {isUploading ? "Uploading..." : "Click to Upload PDF"}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">Maximum size 10MB</p>
                        </div>
                    )}

                    {activeTab === "link" && (
                        <div className="space-y-4">
                            <input
                                type="text"
                                placeholder="Title (e.g. YouTube Tutorial)"
                                value={linkTitle}
                                onChange={(e) => setLinkTitle(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                            />
                            <input
                                type="url"
                                placeholder="https://..."
                                value={linkUrl}
                                onChange={(e) => setLinkUrl(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                            />
                            <button
                                onClick={handleAddLink}
                                disabled={!linkUrl || !linkTitle}
                                className="w-full py-2 bg-black text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50"
                            >
                                Add Link
                            </button>
                        </div>
                    )}

                    {activeTab === "text" && (
                        <div className="space-y-4">
                            <input
                                type="text"
                                placeholder="Title (e.g. Core Principles)"
                                value={textTitle}
                                onChange={(e) => setTextTitle(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                            />
                            <textarea
                                placeholder="Paste context, prompts, or standard operating procedures here..."
                                value={textContent}
                                onChange={(e) => setTextContent(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black min-h-[150px]"
                            />
                            <button
                                onClick={handleAddText}
                                disabled={!textContent || !textTitle}
                                className="w-full py-2 bg-black text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50"
                            >
                                Add Text Resource
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT COLUMN: Output */}
            <div className="flex flex-col h-[calc(100vh-64px)]">
                <div className="bg-gray-900 text-white rounded-t-xl p-4 flex justify-between items-center shadow-lg z-10">
                    <div className="flex items-center gap-2">
                        <Zap className={`text-yellow-400 ${isGenerating ? "animate-pulse" : ""}`} size={18} />
                        <span className="font-semibold tracking-wide text-sm">GENERATED SKILL FILE</span>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating || (resources?.length === 0)}
                            className="px-4 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors disabled:opacity-50"
                        >
                            {isGenerating ? "Synthesizing..." : "Generate MD"}
                        </button>
                        {skill.generatedMd && (
                            <button
                                onClick={handleDownload}
                                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors flex items-center gap-2"
                            >
                                <Download size={14} /> Download
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 bg-white border border-gray-200 border-t-0 rounded-b-xl overflow-hidden relative shadow-sm">
                    {!skill.generatedMd ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 p-12 text-center">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                <FileText size={32} />
                            </div>
                            <p className="max-w-xs">Add resources on the left, then click &quot;Generate MD&quot; to compile the skill definition.</p>
                        </div>
                    ) : (
                        <div className="h-full overflow-y-auto p-8 prose prose-sm max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {skill.generatedMd}
                            </ReactMarkdown>
                        </div>
                    )}

                    {isGenerating && (
                        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-20">
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
                                <p className="font-medium animate-pulse">Clawdbot is synthesizing...</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}
