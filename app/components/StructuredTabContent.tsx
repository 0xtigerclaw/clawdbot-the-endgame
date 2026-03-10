"use client";

import { Sparkles, FileText, Copy, CheckCircle2, AlertCircle, PlayCircle, Clock } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useEffect, useMemo, useState, type ReactNode } from "react";

// --- INTERFACES ---

interface ScoutCandidate {
    id: string;
    title: string;
    bucket_id: string;
    event_summary: string;
    why_it_matters: string;
    proof_points: string[];
    sources: Array<{ label: string; url: string; source_type: string }>;
    angles?: {
        mainstream_take: string;
        second_order_or_contrarian_take: string;
    };
    audience_cluster?: string;
    feature_score: number;
    originality_potential_score?: number;
    tags?: string[];
    // Legacy support
    shift?: string;
    headline?: string;
    url?: string;
    brief?: { url?: string; summary?: string; headline?: string };
    quality?: number;
}

interface ScoutOutput {
    candidates?: ScoutCandidate[];
    top_shifts?: ScoutCandidate[];
    findings?: ScoutCandidate[];
}

interface WriterDraft {
    title: string;
    content: string;
    agent: string;
}

type WriterOutput =
    | { drafts: WriterDraft[] }
    | {
        post_id?: string;
        source_candidate_id?: string;
        audience_cluster?: string;
        post_type?: string;
        drafts: Array<{
            draft_id?: string;
            hook_variants?: string[]; // Writer schema
            final_post_text?: string;
            bridge_line?: string;
            proof_point_used?: string;
            cta_question?: string;
        }>;
    };

interface EditorCheck {
    rule: string;
    status: 'pass' | 'fail' | 'warning';
    notes?: string;
}

interface EditorOutput {
    integrity_checks: EditorCheck[];
    edit_notes: string;
    final_polish?: string;
    finalized_drafts?: Array<{
        draft_id?: string;
        hook_variants?: Record<string, string> | string[];
        final_post_text?: string;
        cta_question?: string;
        proof_point_used?: string;
        quotable_line?: string;
    }>;
}

interface DesignerOutput {
    visual_id?: string;
    prompt_payload?: string;
    veo_payload?: unknown;
    image_url?: string;
}

const PANEL_SHELL =
    "bg-[#121723] border border-white/10 rounded-3xl overflow-hidden shadow-[0_10px_40px_rgba(2,8,24,0.45)] ring-1 ring-white/5";

const PANEL_HEADER =
    "px-6 py-3 bg-gradient-to-r from-black/35 to-white/[0.03] border-b border-white/10 flex justify-between items-center text-xs font-black text-gray-300 uppercase tracking-widest";

const READING_PROSE =
    "prose prose-invert prose-slate max-w-4xl mx-auto prose-headings:text-white prose-headings:tracking-tight prose-p:text-gray-200 prose-p:leading-8 prose-p:text-[1.04rem] prose-li:text-gray-200 prose-li:leading-8 prose-strong:text-white";

const COMPACT_PROSE =
    "prose prose-invert prose-slate max-w-none prose-p:text-gray-200 prose-p:leading-7 prose-p:text-[1rem] prose-li:text-gray-200 prose-li:leading-7 prose-strong:text-white";

async function renderLinkedInOverlayToObjectUrl(rawText: string): Promise<{ objectUrl: string; width: number; height: number }> {
    const text = (rawText || "").replace(/\r\n/g, "\n").trim();
    if (!text) throw new Error("Missing overlay text.");

    const templateUrl = `/templates/linkedin_base.png?t=${Date.now()}`;
    const img = new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";

    const load = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load template image."));
    });
    img.src = templateUrl;
    await load;

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || 1920;
    canvas.height = img.naturalHeight || 1072;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported.");

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const maxLines = 2;
    const maxWidth = Math.round(canvas.width * 0.82);
    const centerX = Math.round(canvas.width * 0.5);
    const centerY = Math.round(canvas.height * 0.46);

    const explicitLines = text.includes("\n")
        ? text
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
        : null;

    if (explicitLines && explicitLines.length > maxLines) {
        throw new Error("Too many lines. Use max 2 lines.");
    }

    let fontSize = Math.round(canvas.height * 0.14);
    fontSize = Math.max(54, Math.min(140, fontSize));
    const minFontSize = 54;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const wrapWords = (t: string): string[] => {
        const words = t.trim().split(/\s+/).filter(Boolean);
        if (words.length === 0) return [];
        const lines: string[] = [];
        let current = "";
        for (const word of words) {
            const candidate = current ? `${current} ${word}` : word;
            if (ctx.measureText(candidate).width <= maxWidth) {
                current = candidate;
                continue;
            }
            if (current) lines.push(current);
            current = word;
        }
        if (current) lines.push(current);
        return lines;
    };

    let lines: string[] = [];
    let fit = false;

    for (let size = fontSize; size >= minFontSize; size -= 2) {
        ctx.font = `800 ${size}px Arial, Helvetica, sans-serif`;

        if (explicitLines) {
            const widest = Math.max(...explicitLines.map((l) => ctx.measureText(l).width), 0);
            if (widest <= maxWidth) {
                lines = explicitLines;
                fontSize = size;
                fit = true;
                break;
            }
            continue;
        }

        const wrapped = wrapWords(text);
        if (wrapped.length <= maxLines) {
            lines = wrapped;
            fontSize = size;
            fit = true;
            break;
        }
    }

    if (!fit) {
        throw new Error("Hook is too long to fit in 2 lines. Shorten it, or add a manual line break.");
    }

    const lineHeight = Math.round(fontSize * 1.18);
    const startY = Math.round(centerY - ((lines.length - 1) * lineHeight) / 2);

    ctx.font = `800 ${fontSize}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = Math.max(6, Math.round(fontSize * 0.08));
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = Math.max(3, Math.round(fontSize * 0.05));
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.max(6, Math.round(fontSize * 0.08));

    for (let i = 0; i < lines.length; i += 1) {
        const y = startY + i * lineHeight;
        ctx.strokeText(lines[i] || "", centerX, y);
        ctx.fillText(lines[i] || "", centerX, y);
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to export image."))), "image/png");
    });

    return { objectUrl: URL.createObjectURL(blob), width: canvas.width, height: canvas.height };
}

// --- HELPER COMPONENT: JSON PARSER ---

function normalizeWriterOutput(input: unknown, agentName: string): { drafts: WriterDraft[]; meta?: { post_id?: string; post_type?: string } } | null {
    if (!input || typeof input !== "object") return null;
    const data = input as Record<string, unknown>;
    if (!Array.isArray(data.drafts)) return null;

    // Support both legacy {drafts:[{title,content,agent}]} and bundle drafts
    const drafts = (data.drafts as unknown[])
        .map((d) => (d && typeof d === "object") ? (d as Record<string, unknown>) : null)
        .filter((d): d is Record<string, unknown> => Boolean(d))
        .map((d, idx) => {
            const title =
                typeof d.title === "string"
                    ? d.title
                    : typeof d.draft_id === "string"
                        ? d.draft_id
                        : `Draft ${idx + 1}`;

            const hooks = Array.isArray(d.hook_variants)
                ? d.hook_variants.filter((h) => typeof h === "string").map((h) => `- ${h}`).join("\n")
                : "";

            const finalPost = typeof d.final_post_text === "string" ? d.final_post_text : (typeof d.content === "string" ? d.content : "");
            const proofPoint = typeof d.proof_point_used === "string" ? d.proof_point_used : "";
            const cta = typeof d.cta_question === "string" ? d.cta_question : "";

            const contentParts = [
                hooks ? `### Hook Variants\n${hooks}` : "",
                finalPost ? `### Draft\n\n${finalPost}` : "",
                proofPoint ? `### Proof Point Used\n- ${proofPoint}` : "",
                cta ? `### CTA\n- ${cta}` : "",
            ].filter(Boolean);

            return {
                title,
                agent: typeof d.agent === "string" ? d.agent : agentName,
                content: contentParts.join("\n\n"),
            };
        });

    const post_id = typeof data.post_id === "string" ? data.post_id : undefined;
    const post_type = typeof data.post_type === "string" ? data.post_type : undefined;

    return { drafts, meta: { post_id, post_type } };
}

function normalizeEditorOutput(input: unknown): EditorOutput {
    const data = (input && typeof input === "object") ? (input as Record<string, unknown>) : {};

    const rawChecks = data.integrity_checks;
    let checks: unknown[] = [];
    if (Array.isArray(rawChecks)) {
        checks = rawChecks;
    } else if (rawChecks && typeof rawChecks === "object") {
        checks = Object.values(rawChecks as Record<string, unknown>);
    }

    const integrity_checks: EditorCheck[] = checks
        .map((c) => (c && typeof c === "object") ? (c as Record<string, unknown>) : null)
        .filter((c): c is Record<string, unknown> => Boolean(c))
        .map((c) => ({
            rule: typeof c.rule === "string" ? c.rule : "Unnamed check",
            status: (c.status === "pass" || c.status === "fail" || c.status === "warning") ? c.status : "warning",
            notes: typeof c.notes === "string" ? c.notes : undefined,
        }));

    const edit_notes =
        typeof data.edit_notes === "string"
            ? data.edit_notes
            : typeof data.edit_notes === "undefined"
                ? ""
                : JSON.stringify(data.edit_notes);

    const final_polish = typeof data.final_polish === "string" ? data.final_polish : undefined;

    const rawFinalized = data.finalized_drafts;
    const finalized_drafts = Array.isArray(rawFinalized)
        ? rawFinalized
            .map((d) => (d && typeof d === "object") ? (d as Record<string, unknown>) : null)
            .filter((d): d is Record<string, unknown> => Boolean(d))
            .map((d) => ({
                draft_id: typeof d.draft_id === "string" ? d.draft_id : undefined,
                hook_variants:
                    Array.isArray(d.hook_variants)
                        ? d.hook_variants.filter((h): h is string => typeof h === "string")
                        : (d.hook_variants && typeof d.hook_variants === "object")
                            ? Object.fromEntries(
                                Object.entries(d.hook_variants as Record<string, unknown>)
                                    .filter(([, v]) => typeof v === "string")
                                    .map(([k, v]) => [k, v as string])
                            )
                            : undefined,
                final_post_text: typeof d.final_post_text === "string" ? d.final_post_text : undefined,
                cta_question: typeof d.cta_question === "string" ? d.cta_question : undefined,
                proof_point_used: typeof d.proof_point_used === "string" ? d.proof_point_used : undefined,
                quotable_line: typeof d.quotable_line === "string" ? d.quotable_line : undefined,
            }))
        : undefined;

    return { integrity_checks, edit_notes, final_polish, finalized_drafts };
}

function tryParseAgentJson(content: string): { type: 'writer' | 'editor' | 'designer' | 'scout' | 'unknown', data: unknown } | null {
    try {
        // 1. Try to find JSON block
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/) || content.match(/({[\s\S]*})/);

        if (!jsonMatch) return null;

        const jsonStr = (jsonMatch[1] || jsonMatch[0]).trim();
        const data: unknown = JSON.parse(jsonStr);

        // 2. Identify Type
        if (data && typeof data === "object") {
            const obj = data as Record<string, unknown>;
            if (obj.drafts && Array.isArray(obj.drafts)) return { type: 'writer', data };
            if (obj.integrity_checks || obj.edit_notes || obj.finalized_drafts) return { type: 'editor', data: normalizeEditorOutput(obj) };
            if (obj.prompt_payload || obj.visual_id || obj.veo_payload || obj.overlay_payload) return { type: 'designer', data };
            if (obj.candidates || obj.top_shifts || obj.findings) return { type: 'scout', data };
        }
        if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object") return { type: 'scout', data };

        return { type: 'unknown', data };
    } catch {
        return null;
    }
}

// --- SUB-VIEWS ---

const WriterView = ({ data, agentName }: { data: WriterOutput; agentName: string }) => {
    const normalized = normalizeWriterOutput(data, agentName);
    let drafts: WriterDraft[] = [];
    if (normalized) {
        drafts = normalized.drafts;
    } else if (data && typeof data === "object") {
        const maybe = (data as Record<string, unknown>).drafts;
        if (Array.isArray(maybe)) {
            drafts = maybe
                .map((d) => (d && typeof d === "object") ? (d as Record<string, unknown>) : null)
                .filter((d): d is Record<string, unknown> => Boolean(d))
                .map((d, idx) => ({
                    title: typeof d.title === "string" ? d.title : `Draft ${idx + 1}`,
                    content: typeof d.content === "string" ? d.content : "",
                    agent: typeof d.agent === "string" ? d.agent : agentName,
                }));
        }
    }
		    return (
		        <div className="space-y-8">
		            {drafts.map((draft, idx) => (
			                <div key={idx} className={PANEL_SHELL}>
			                    <div className={PANEL_HEADER}>
			                        <span>Draft {idx + 1} • {draft.agent}</span>
			                    </div>
			                    <div className="p-7 md:p-9">
			                        <div className={READING_PROSE}>
			                            <EnhancedMarkdown content={String(draft.content || "")} />
			                        </div>
			                    </div>
			                </div>
		            ))}
	        </div>
	    );
	};

const EditorView = ({ data }: { data: EditorOutput }) => {
    const finalized = data.finalized_drafts || [];
    const passCount = data.integrity_checks.filter(c => c.status === "pass").length;
    const warnCount = data.integrity_checks.filter(c => c.status === "warning").length;
    const failCount = data.integrity_checks.filter(c => c.status === "fail").length;
    return (
        <div className="space-y-8">
            {finalized.length > 0 && (
                <div className={PANEL_SHELL}>
                    <div className={PANEL_HEADER}>
                        <span>Finalized Drafts</span>
                    </div>
                    <div className="p-7 md:p-8">
                    <h4 className="text-xs font-black text-gray-300 uppercase tracking-widest mb-4">Finalized Drafts</h4>
                    <div className="space-y-6">
                        {finalized.map((d, idx) => {
                            const hooks = Array.isArray(d.hook_variants)
                                ? d.hook_variants
                                : d.hook_variants && typeof d.hook_variants === "object"
                                    ? Object.entries(d.hook_variants).map(([k, v]) => `${k}: ${v}`)
                                    : [];
                            return (
                                <div key={idx} className="border border-white/10 rounded-2xl overflow-hidden bg-[#0f1522]">
                                    <div className="px-5 py-3 bg-black/30 border-b border-white/10 text-xs font-black text-gray-300 uppercase tracking-widest flex items-center justify-between">
                                        {d.draft_id || `Draft ${idx + 1}`}
                                        <span className="text-[10px] text-gray-500 font-mono">Editor</span>
                                    </div>
                                    <div className="p-6 space-y-5">
                                        {hooks.length > 0 && (
                                            <div className="text-sm text-gray-200">
                                                <div className="font-black text-gray-400 uppercase tracking-widest mb-3">Hook variants</div>
                                                <ul className="space-y-2">
                                                    {hooks.slice(0, 8).map((h, i) => (
                                                        <li key={i} className="flex items-start gap-3">
                                                            <span className="mt-2 h-2 w-2 rounded-full bg-blue-400/70"></span>
                                                            <span>{h}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {d.quotable_line && (
                                            <div className="text-sm bg-white/[0.04] border border-white/10 rounded-xl p-4 text-gray-200">
                                                <span className="font-bold text-white">Quotable:</span> {d.quotable_line}
                                            </div>
                                        )}
                                        {d.final_post_text && (
                                            <div className={READING_PROSE}>
                                                <EnhancedMarkdown content={d.final_post_text} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    </div>
                </div>
            )}
            {data.final_polish && (
                <div className={PANEL_SHELL}>
                    <div className={PANEL_HEADER}>
                        <span>Final Polished Version</span>
                    </div>
                    <div className="p-8 md:p-9">
                    <div className={READING_PROSE}>
                        <EnhancedMarkdown content={data.final_polish} />
                    </div>
                    </div>
                </div>
            )}

            <div className={PANEL_SHELL}>
                <div className={PANEL_HEADER}>
                    <span>Editor Notes</span>
                </div>
                <div className="p-7 md:p-8">
                <div className={READING_PROSE}>
                    <EnhancedMarkdown content={data.edit_notes} />
                </div>
                </div>
            </div>

            {/* Footer: criteria/integrity checks */}
            <details className={PANEL_SHELL}>
                <summary className="cursor-pointer select-none px-6 py-4 flex items-center justify-between text-xs font-black text-gray-300 uppercase tracking-widest hover:bg-black/30 transition-colors">
                    <span>Integrity Checks</span>
                    <span className="font-mono text-[11px] text-gray-400 normal-case tracking-normal">
                        {passCount} pass • {warnCount} warn • {failCount} fail
                    </span>
                </summary>
                <div className="px-6 pb-6 pt-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {data.integrity_checks.map((check, idx) => (
                            <div
                                key={idx}
                                className={`p-4 rounded-xl border flex items-start gap-3 ${check.status === "pass"
                                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-200"
                                    : check.status === "warning"
                                        ? "bg-amber-500/10 border-amber-500/20 text-amber-200"
                                        : "bg-red-500/10 border-red-500/20 text-red-200"
                                    }`}
                            >
                                <div className="mt-0.5">
                                    {check.status === "pass" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-white">{check.rule}</p>
                                    {check.notes && <p className="text-xs opacity-80 mt-1">{check.notes}</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </details>
        </div>
    );
};

const DesignerView = ({ data, rawContent }: { data: DesignerOutput; rawContent: string }) => {
    const generatedMatch = rawContent.match(/\/generated\/[^\s)"']+/);
    const imageUrl = data.image_url || (generatedMatch ? generatedMatch[0] : undefined);
    const [currentSrc, setCurrentSrc] = useState<string | null>(imageUrl || null);
    const [customText, setCustomText] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastObjectUrl, setLastObjectUrl] = useState<string | null>(null);

    useEffect(() => {
        setCurrentSrc(imageUrl || null);
    }, [imageUrl]);

    useEffect(() => {
        return () => {
            if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
        };
    }, [lastObjectUrl]);

    const href = (currentSrc || "").split("?")[0];
    const filename =
        href.startsWith("blob:") || href.startsWith("data:")
            ? `linkedin_overlay_custom_${Date.now()}.png`
            : (href.split("/").pop() || "image.png");
	    const canCustomize = Boolean(imageUrl && imageUrl.includes("/generated/"));

	    const regenerate = async () => {
	        if (!customText.trim()) return;
	        setIsGenerating(true);
	        setError(null);
	        try {
	            const { objectUrl } = await renderLinkedInOverlayToObjectUrl(customText);
	            if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
	            setLastObjectUrl(objectUrl);
	            setCurrentSrc(objectUrl);
	        } catch (e: unknown) {
	            const msg = e instanceof Error ? e.message : String(e);
	            setError(msg);
	        } finally {
            setIsGenerating(false);
        }
    };
    return (
        <div className="space-y-8">
            <div className={`${PANEL_SHELL} aspect-video flex items-center justify-center relative group`}>
                {currentSrc ? (
                    <img src={currentSrc} alt="Generated Visual" className="w-full h-full object-contain" />
                ) : (
                    <div className="text-center p-12">
                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/10">
                            <Sparkles className="text-purple-400" size={32} />
                        </div>
                        <h4 className="text-white font-bold mb-2">Visual Generation Protocol</h4>
                        <p className="text-gray-500 text-sm max-w-md mx-auto">Concept ready for Veo/Imagen rendering. Awaiting final frame synthesis.</p>
                    </div>
                )}
            </div>

            {currentSrc ? (
                <div className={`${PANEL_SHELL} p-4 space-y-3`}>
                    <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                            Final image
                        </span>
                        <a
                            href={href}
                            download={filename}
                            className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-gray-200 hover:bg-white/10 hover:border-white/20 transition-colors"
                        >
                            Download
                        </a>
                    </div>

                    {canCustomize ? (
                        <div className="space-y-2">
                            <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                                Custom overlay (max 2 lines)
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    value={customText}
                                    onChange={(e) => setCustomText(e.target.value)}
                                    placeholder="Paste your hook text…"
                                    className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                                />
                                <button
                                    onClick={regenerate}
                                    disabled={isGenerating || !customText.trim()}
                                    className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors ${isGenerating || !customText.trim()
                                        ? "bg-white/5 text-gray-500 border-white/5 cursor-not-allowed"
                                        : "bg-white/10 text-gray-100 border-white/10 hover:bg-white/15 hover:border-white/20"
                                        }`}
                                >
                                    {isGenerating ? "Generating…" : "Generate"}
                                </button>
                            </div>
                            {error ? (
                                <div className="text-xs text-red-400">{error}</div>
                            ) : (
                                <div className="text-xs text-gray-500">
                                    Tip: write a punchy one-liner; the renderer enforces 2 lines.
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>
            ) : null}

        </div>
    );
};

const ScoutView = ({ data }: { data: ScoutOutput | ScoutCandidate[] }) => {
    const candidates = Array.isArray(data) ? data : (data.candidates || data.top_shifts || data.findings || []);

    return (
        <div className="space-y-12">
            <div className="flex items-center justify-between border-b border-white/10 pb-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20 shadow-inner">
                        <Sparkles size={24} />
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-white tracking-tight">INTEL REPORT</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-blue-400 font-bold uppercase tracking-[0.2em] bg-blue-500/5 px-2 py-0.5 rounded border border-blue-500/10">MISSION COMPLETE</span>
                            <span className="text-[10px] text-gray-500 font-medium uppercase tracking-widest">{candidates.length} Signals Validated</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-10">
                {candidates.map((item, idx) => {
                    const url = item.sources?.[0]?.url || item.brief?.url || item.url || "#";
                    const title = item.title || item.shift || item.headline || "Untitled Signal";
                    const summary = item.event_summary || item.why_it_matters || item.brief?.summary || item.brief?.headline;
                    const score = item.feature_score || item.quality || 7;
                    const originality = item.originality_potential_score || 7;

                    return (
                        <div key={idx} className={`group relative ${PANEL_SHELL} hover:border-blue-500/40 transition-all duration-500`}>
                            <div className="flex flex-col">
                                {/* Header Bar */}
                                <div className="px-8 py-4 bg-black/40 border-b border-white/10 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.6)]"></div>
                                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                            {item.bucket_id?.replace(/_/g, ' ') || "GENERAL SIGNAL"}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] font-bold text-gray-600 uppercase">Impact</span>
                                            <span className="text-sm font-black text-blue-400">{score}/10</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] font-bold text-gray-600 uppercase">Originality</span>
                                            <span className="text-sm font-black text-emerald-400">{originality}/10</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-8 md:p-10 space-y-8">
                                    {/* Title & Core Summary */}
                                    <div className="space-y-4">
                                        <h4 className="text-2xl md:text-3xl font-black text-white group-hover:text-blue-400 transition-colors leading-[1.1] tracking-tight">
                                            {title}
                                        </h4>
                                        <div className={COMPACT_PROSE}>
                                            <EnhancedMarkdown content={summary || ""} />
                                        </div>
                                    </div>

                                    {/* Why it Matters & Second Order */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                                        <div className="space-y-3 p-5 rounded-2xl bg-white/5 border border-white/5">
                                            <div className="flex items-center gap-2 text-blue-400">
                                                <CheckCircle2 size={16} />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Why it Matters</span>
                                            </div>
                                            <div className={COMPACT_PROSE}>
                                                <EnhancedMarkdown content={item.why_it_matters || ""} />
                                            </div>
                                        </div>

                                        {item.angles && (
                                            <div className="space-y-3 p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/10">
                                                <div className="flex items-center gap-2 text-emerald-400">
                                                    <Sparkles size={16} />
                                                    <span className="text-[10px] font-black uppercase tracking-widest">Contrarian Angle</span>
                                                </div>
                                                <div className={COMPACT_PROSE}>
                                                    <EnhancedMarkdown content={item.angles.second_order_or_contrarian_take || ""} />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Proof Points & Stats */}
                                    {item.proof_points && item.proof_points.length > 0 && (
                                        <div className="space-y-4 pt-4">
                                            <div className="flex items-center gap-2 text-gray-500">
                                                <AlertCircle size={14} />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Hard Evidence</span>
                                            </div>
                                            <div className="grid grid-cols-1 gap-3">
                                                {item.proof_points.map((point, pIdx) => (
                                                    <div key={pIdx} className="flex gap-4 p-3 rounded-xl bg-black/20 border border-white/5 text-gray-300 text-sm italic group/point">
                                                        <span className="text-blue-500 font-mono text-xs mt-0.5">0{pIdx + 1}</span>
                                                        {point}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Meta & Sources */}
                                    <div className="pt-8 border-t border-white/5 flex flex-wrap items-center justify-between gap-6">
                                        <div className="flex items-center gap-6">
                                            <div>
                                                <span className="text-[10px] font-bold text-gray-600 uppercase block mb-1">Target Audience</span>
                                                <span className="text-xs font-bold text-white bg-white/5 px-2 py-1 rounded border border-white/10">
                                                    {item.audience_cluster?.replace(/_/g, ' ') || "General"}
                                                </span>
                                            </div>
                                            {item.tags && item.tags.length > 0 && (
                                                <div>
                                                    <span className="text-[10px] font-bold text-gray-600 uppercase block mb-1">Signal Tags</span>
                                                    <div className="flex gap-2">
                                                        {item.tags.map((tag, tIdx) => (
                                                            <span key={tIdx} className="text-[10px] font-medium text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/10">
                                                                #{tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <a
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-[11px] font-black uppercase rounded-xl hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20 active:scale-95 group/btn"
                                            >
                                                <FileText size={16} className="group-hover/btn:rotate-12 transition-transform" />
                                                Primary Source
                                            </a>
                                            <button className="p-2.5 text-gray-500 hover:text-white bg-white/5 rounded-xl border border-white/10 transition-colors">
                                                <Copy size={18} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Final Sign-off */}
            <div className="pt-12 border-t border-white/5 text-center">
                <p className="text-xs text-gray-600 font-black uppercase tracking-[0.3em]">Intel gathered. Briefing complete.</p>
            </div>
        </div>
    );
};


const StyledCallout = ({ children, type }: { children: ReactNode, type: 'why' | 'proof' | 'sources' | 'angle' | 'visual' | 'veo' }) => {
    let icon = <CheckCircle2 size={16} />;
    let title = "WHY IT MATTERS";
    let bgColor = "bg-blue-500/5 border-blue-500/10";
    let textColor = "text-blue-400";

    if (type === 'proof') {
        icon = <AlertCircle size={16} />;
        title = "HARD EVIDENCE";
        bgColor = "bg-black/40 border-white/5";
        textColor = "text-gray-400";
    } else if (type === 'sources') {
        icon = <FileText size={16} />;
        title = "SOURCES";
        bgColor = "bg-emerald-500/5 border-emerald-500/10";
        textColor = "text-emerald-400";
    } else if (type === 'angle') {
        icon = <Sparkles size={16} />;
        title = "STRATEGIC ANGLE";
        bgColor = "bg-purple-500/5 border-purple-500/10";
        textColor = "text-purple-400";
    } else if (type === 'visual') {
        icon = <Sparkles size={16} />;
        title = "VISUAL BRIEF";
        bgColor = "bg-purple-500/5 border-purple-500/10";
        textColor = "text-purple-400";
    } else if (type === 'veo') {
        icon = <PlayCircle size={16} />;
        title = "VEO MOTION PROMPT";
        bgColor = "bg-amber-500/5 border-amber-500/10";
        textColor = "text-amber-400";
    }

    return (
        <div className={`my-8 p-6 rounded-2xl border ${bgColor} animate-in fade-in slide-in-from-bottom-2 duration-700`}>
            <div className={`flex items-center gap-2 mb-3 ${textColor}`}>
                {icon}
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">{title}</span>
            </div>
            <div className="prose prose-invert prose-sm max-w-none text-gray-300">
                {children}
            </div>
        </div>
    );
};

const EnhancedMarkdown = ({ content }: { content: string }) => {
    const GeneratedOverlayImage = ({ src, alt }: { src: string; alt?: string }) => {
        const initialHref = useMemo(() => src.split("?")[0], [src]);
        const initialFilename = useMemo(() => {
            const href = initialHref;
            return href ? (href.split("/").pop() || "image.png") : "image.png";
        }, [initialHref]);

        const [currentSrc, setCurrentSrc] = useState(src);
        const [customText, setCustomText] = useState("");
        const [isGenerating, setIsGenerating] = useState(false);
        const [error, setError] = useState<string | null>(null);
        const [lastObjectUrl, setLastObjectUrl] = useState<string | null>(null);

        const href = useMemo(() => currentSrc.split("?")[0], [currentSrc]);
        const filename = useMemo(() => {
            if (href.startsWith("blob:") || href.startsWith("data:")) {
                return `linkedin_overlay_custom_${Date.now()}.png`;
            }
            return href ? (href.split("/").pop() || initialFilename) : initialFilename;
        }, [href, initialFilename]);

	    const canCustomize = initialHref.startsWith("/generated/") || href.startsWith("blob:") || href.startsWith("data:");

        useEffect(() => {
            return () => {
                if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
            };
        }, [lastObjectUrl]);

	        const regenerate = async () => {
	            if (!customText.trim()) return;
	            setIsGenerating(true);
	            setError(null);
	            try {
	                const { objectUrl } = await renderLinkedInOverlayToObjectUrl(customText);
	                if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
	                setLastObjectUrl(objectUrl);
	                setCurrentSrc(objectUrl);
	            } catch (e: unknown) {
	                const msg = e instanceof Error ? e.message : String(e);
	                setError(msg);
	            } finally {
                setIsGenerating(false);
            }
        };

        return (
            <span className="block my-8 rounded-xl overflow-hidden border border-gray-800 shadow-xl bg-black/20 ring-1 ring-white/10">
                <img
                    src={currentSrc}
                    alt={alt || "Visual"}
                    className="w-full h-full max-h-[600px] object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <span className="flex flex-col gap-3 p-3 bg-[#0a0a0a] border-t border-gray-800">
                    <span className="flex items-center justify-between gap-3">
                        <span className="text-xs text-gray-500 font-medium tracking-wide">{alt || ""}</span>
                        {href ? (
                            <a
                                href={href}
                                download={filename}
                                className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-gray-200 hover:bg-white/10 hover:border-white/20 transition-colors"
                            >
                                Download
                            </a>
                        ) : null}
                    </span>

                    {canCustomize ? (
                        <span className="flex flex-col gap-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                                Custom overlay (max 2 lines)
                            </span>
                            <span className="flex items-center gap-2">
                                <input
                                    value={customText}
                                    onChange={(e) => setCustomText(e.target.value)}
                                    placeholder="Paste your hook text…"
                                    className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                                />
                                <button
                                    onClick={regenerate}
                                    disabled={isGenerating || !customText.trim()}
                                    className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors ${isGenerating || !customText.trim()
                                        ? "bg-white/5 text-gray-500 border-white/5 cursor-not-allowed"
                                        : "bg-white/10 text-gray-100 border-white/10 hover:bg-white/15 hover:border-white/20"
                                        }`}
                                >
                                    {isGenerating ? "Generating…" : "Generate"}
                                </button>
                            </span>
                            {error ? (
                                <span className="text-xs text-red-400">{error}</span>
                            ) : (
                                <span className="text-xs text-gray-500">
                                    Tip: write a punchy one-liner; the renderer enforces 2 lines.
                                </span>
                            )}
                        </span>
                    ) : null}
                </span>
            </span>
        );
    };

    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                h2: ({ children }) => (
                    <h2 className="text-2xl font-black text-white mt-12 mb-6 border-b border-white/5 pb-2 flex items-center gap-3 group">
                        <span className="w-1 h-6 bg-blue-500 rounded-full group-hover:h-8 transition-all"></span>
                        {children}
                    </h2>
                ),
                h3: ({ children }) => (
                    <h3 className="text-[1.15rem] font-bold text-white mt-10 mb-4 tracking-tight uppercase">
                        {children}
                    </h3>
                ),
                ul: ({ children }) => (
                    <ul className="my-3 space-y-2">{children}</ul>
                ),
                li: ({ children }) => (
                    <li className="list-none flex gap-3 mb-2 last:mb-0 group/li">
                        <div className="w-2 h-2 rounded-full bg-blue-400/70 mt-2.5 flex-shrink-0 group-hover/li:bg-blue-300 transition-colors"></div>
                        <div>{children}</div>
                    </li>
                ),
                p: ({ children }) => {
                    const childArray = Array.isArray(children) ? children : [children];
                    const firstChild = childArray[0];
                    if (typeof firstChild === 'string') {
                        const textContent = firstChild.toString();
                        if (textContent.startsWith("Why it matters:")) return <StyledCallout type="why">{children}</StyledCallout>;
                        if (textContent.startsWith("Proof points:") || textContent.startsWith("Hard Evidence:")) return <StyledCallout type="proof">{children}</StyledCallout>;
                        if (textContent.startsWith("Sources:")) return <StyledCallout type="sources">{children}</StyledCallout>;
                        if (textContent.startsWith("Contrarian Angle:")) return <StyledCallout type="angle">{children}</StyledCallout>;
                        if (textContent.startsWith("Visual brief:")) return <StyledCallout type="visual">{children}</StyledCallout>;
                        if (textContent.startsWith("Veo prompt:")) return <StyledCallout type="veo">{children}</StyledCallout>;
                    }
                    return <p className="leading-8 mb-6">{children}</p>;
                },
                strong: ({ children }) => (
                    <strong className="font-semibold text-white">{children}</strong>
                ),
                img: ({ src, alt }) => {
                    const str = typeof src === "string" ? src : "";
                    if (!str) return null;
                    return <GeneratedOverlayImage src={str} alt={alt || "Visual"} />;
                }
            }}
        >
            {content}
        </ReactMarkdown>
    );
};


const TraceView = ({ content }: { content: string }) => {
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <div className={`${PANEL_SHELL} p-10 flex flex-col md:flex-row items-center gap-8 relative group`}>
                {/* Background Decoration */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 blur-[100px] -z-10 group-hover:bg-blue-500/20 transition-all duration-1000"></div>

                <div className="w-20 h-20 rounded-3xl bg-blue-500/20 flex items-center justify-center text-blue-400 border border-blue-500/20 shadow-2xl shrink-0 group-hover:scale-110 transition-transform duration-700">
                    <Clock size={40} />
                </div>
                <div>
                    <h4 className="text-xl font-black text-white uppercase tracking-[0.3em] mb-2">RAW SIGNAL LINEAGE</h4>
                    <p className="text-gray-400 font-medium max-w-xl">
                        Below are the raw extraction points Curie scanned before identifying the top strategic shifts.
                        Use this trace for full auditability of the mission&apos;s intelligence flow.
                    </p>
                </div>
            </div>

            <div className={PANEL_SHELL}>
                <div className="p-7 md:p-9">
                <div className={READING_PROSE}>
                    <EnhancedMarkdown content={content} />
                </div>
                </div>
            </div>
        </div>
    );
};

const PrettyJsonView = ({ data }: { data: Record<string, unknown> }) => {
    return (
        <div className="space-y-6">
            <div className={PANEL_SHELL}>
                <div className="p-7 md:p-8">
                <div className="flex items-center gap-3 mb-6 text-gray-400">
                    <FileText size={16} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Structured Data Extract</span>
                </div>

                <div className="space-y-4">
                    {Object.entries(data).map(([key, value], idx) => (
                        <div key={idx} className="border-b border-white/5 pb-4 last:border-0">
                            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider block mb-1">{key.replace(/_/g, ' ')}</span>
                            {typeof value === 'object' ? (
                                <pre className="text-xs text-gray-400 bg-black/30 p-4 rounded-xl overflow-x-auto border border-white/5">
                                    {JSON.stringify(value, null, 2)}
                                </pre>
                            ) : (
                                <p className="text-gray-300 font-medium">{String(value)}</p>
                            )}
                        </div>
                    ))}
                </div>
                </div>
            </div>
        </div>
    );
};


// --- MAIN COMPONENT ---

export default function StructuredTabContent({ content, agentName, activeTabId }: { content: string, agentName: string, activeTabId?: string }) {
    const parsed = tryParseAgentJson(content);

    if (activeTabId === 'trace') return <TraceView content={content} />;

    if (parsed) {
        if (parsed.type === 'writer') return <WriterView data={parsed.data as WriterOutput} agentName={agentName} />;
        if (parsed.type === 'editor') return <EditorView data={parsed.data as EditorOutput} />;
        if (parsed.type === 'designer') return <DesignerView data={parsed.data as DesignerOutput} rawContent={content} />;
        if (parsed.type === 'scout') return <ScoutView data={parsed.data as ScoutOutput} />;
        if (parsed.type === 'unknown') {
            if (parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data)) {
                return <PrettyJsonView data={parsed.data as Record<string, unknown>} />;
            }
            // If unknown is an array or primitive, just render markdown
            return (
                <div className={READING_PROSE}>
                    <EnhancedMarkdown content={content} />
                </div>
            );
        }
    }

    // Fallback to enhanced markdown
    return (
        <div className={READING_PROSE}>
            <EnhancedMarkdown content={content} />
        </div>
    );
}
