export function formatFinalReport(taskTitle: string, rawOutput: string): string {
    // Helper to extract JSON from a block
    const extractJSON = (text: string): unknown => {
        try {
            const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const jsonStr = jsonMatch[1] || jsonMatch[0];
                return JSON.parse(jsonStr);
            }
        } catch {
            return null;
        }
        return null;
    };

    type Tab = { id: string; label: string; content: string };
    const tabs: Tab[] = [];
    type OgilvyDraft = { hook_variants?: string[]; final_post_text: string; cta_question?: string };
    type OgilvyData = { drafts?: OgilvyDraft[] };
    type CarnegieDraft = { final_post_text: string };
    type CarnegieData = {
        finalized_drafts?: CarnegieDraft[];
        scores?: { editorial_clarity_score?: number; narrative_pull_score?: number };
        distribution_kit?: { outreach_targets?: string[] };
    };
    type IveData = {
        veo_payload?: {
            prompt?: { scene?: string; action?: string };
            style?: { look?: string[] };
        };
        overlay_payload?: { overlays?: Array<{ text?: string }> };
    };

    // 1. OGILVY (Writer)
    if (rawOutput.includes("**Ogilvy:**")) {
        const ogilvySection = rawOutput.split("**Ogilvy:**")[1].split("**Carnegie:**")[0]; // Rough split
        const data = extractJSON(ogilvySection) as OgilvyData | null;

        if (data && data.drafts && data.drafts.length > 0) {
            let content = "";
            // Pick the best draft (first one usually)
            const bestDraft = data.drafts[0];
            const hook = bestDraft.hook_variants?.[0] || bestDraft.final_post_text?.split('\n')[0];

            content += `> **Hook Strategy:** "${hook}"\n\n`;

            // Format for readability (Markdown collapses single newlines)
            const readableDraft = bestDraft.final_post_text.replace(/\n/g, '\n\n');
            content += `${readableDraft}\n\n`;

            if (bestDraft.cta_question) {
                content += `**CTA:** ${bestDraft.cta_question}\n\n`;
            }

            tabs.push({
                id: "writer",
                label: "✍️ Writer (Ogilvy)",
                content: content
            });
        }
    }

    // 2. CARNEGIE (Editor)
    if (rawOutput.includes("**Carnegie:**")) {
        const carnegieSection = rawOutput.split("**Carnegie:**")[1].split("**Ive:**")[0];
        const data = extractJSON(carnegieSection) as CarnegieData | null;

        if (data && data.finalized_drafts && data.finalized_drafts.length > 0) {
            let content = "";
            content += `### 📝 Final LinkedIn Post\n`;
            const finalDraft = data.finalized_drafts[0];
            content += "```text\n" + finalDraft.final_post_text + "\n```\n\n";

            if (data.scores) {
                content += `**Quality Scores:**\n`;
                content += `- Clarity: ${data.scores.editorial_clarity_score}/10\n`;
                content += `- Pull: ${data.scores.narrative_pull_score}/10\n`;
            }

            if (data.distribution_kit?.outreach_targets) {
                content += `\n**🎯 Recommended Outreach Targets:**\n`;
                data.distribution_kit.outreach_targets.forEach((t: string) => content += `- ${t}\n`);
            }

            tabs.push({
                id: "editor",
                label: "📢 Editor (Carnegie)",
                content: content
            });
        }
    }

    // 3. IVE (Visuals)
    if (rawOutput.includes("**Ive:**")) {
        const iveSection = rawOutput.split("**Ive:**")[1];
        const data = extractJSON(iveSection) as IveData | null;

        // Check for Markdown image syntax in the raw text too, as logs might have it
        const imageMatch = iveSection.match(/!\[.*?\]\((.*?)\)/);

        let content = "";
        if (imageMatch) {
            content += `![Design Mockup](${imageMatch[1]})\n\n`;
        }

        if (data && data.veo_payload) {
            const prompt = data.veo_payload.prompt;
            const look = data.veo_payload.style?.look || [];
            content += `**Veo Prompt Strategy:**\n`;
            content += `> *"${prompt?.scene || ""} ${prompt?.action || ""}"*\n`;
            content += `- **Style:** ${look.join(", ")}\n`;

            if (data.overlay_payload?.overlays) {
                content += `- **Overlays:** "${data.overlay_payload.overlays.map((o) => o.text).join('" + "')}"\n`;
            }
        }

        tabs.push({
            id: "designer",
            label: "🎨 Designer (Ive)",
            content: content
        });
    }

    // Fallback?
    if (tabs.length === 0) return rawOutput;

    // Return JSON string
    return JSON.stringify({ tabs });
}
