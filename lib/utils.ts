import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export type MissionBlock = {
    agent: string;
    role: string;
    content: string;
    timestamp?: string;
};

export function parseMissionReport(markdown: string): MissionBlock[] {
    if (!markdown) return [];

    // Split by the specific separator we use in `llm.ts`
    // We use "\n\n---\n\n" to separate reports.
    const rawBlocks = markdown.split(/\n\s*---\s*\n/);

    const blocks: MissionBlock[] = [];

    for (const raw of rawBlocks) {
        const trimmed = raw.trim();
        if (!trimmed) continue;

        // Try to extract metadata
        // Format: "**Agent:** Name", "**Status:** Status"
        const agentMatch = trimmed.match(/\*\*Agent:\*\*\s*(.+?)(\n|$)/i);

        // If we find an agent header, it's a structural block
        if (agentMatch) {
            const agentName = agentMatch[1].trim();

            // Attempt to infer role based on known roster (optional, can be done in UI)
            const role = "Agent";

            // Clean up the content by removing the header section if needed, 
            // but for now, we keep the content as is for the Markdown renderer
            // or we could strip the top metadata lines to make it cleaner.
            // Let's strip the standard header lines to avoid redundancy in the UI card
            const content = trimmed
                .replace(/\*\*Agent:\*\*\s*.+?(\n|$)/i, "")
                .replace(/\*\*Status:\*\*\s*.+?(\n|$)/i, "")
                .trim();

            blocks.push({
                agent: agentName,
                role: role, // Placeholder, can be mapped in UI
                content: content
            });
        } else {
            // If it's a legacy element or user feedback, or just a separator
            // We might want to attribute it to "System" or "Previous Context"
            // For now, let's treat it as a generic block if it has content
            if (trimmed.length > 0) {
                blocks.push({
                    agent: "System",
                    role: "Context",
                    content: trimmed
                });
            }
        }
    }

    return blocks;
}
