import * as fs from "fs";
import * as path from "path";
import { Resvg } from "@resvg/resvg-js";
import { imageSize } from "image-size";

function escapeXml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function truncateWords(input: string, maxChars: number): string {
  const trimmed = normalizeWhitespace(input);
  if (trimmed.length <= maxChars) return trimmed;
  const slice = trimmed.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 20 ? slice.slice(0, lastSpace) : slice).trimEnd() + "…";
}

function cleanOverlayText(input: string): string {
  const cleaned = normalizeWhitespace(
    input
      .replace(/https?:\/\/\S+/g, "")
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, "") // strip most emoji blocks
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'"),
  );
  return cleaned.replace(/\s+/g, " ").trim();
}

function stripTaskPrefixes(input: string): string {
  return input
    .replace(/^\s*(draft content|linkedin post|scout scan|blog|article)\s*:\s*/i, "")
    .replace(/^\s*(writer|editor|designer)\s*:\s*/i, "")
    .trim();
}

function isBannedOverlay(text: string): boolean {
  const t = normalizeWhitespace(text).toLowerCase();
  if (!t) return true;

  // Avoid accidentally using agent labels / tab labels as overlay text.
  const banned = new Set([
    "ogilvy",
    "carnegie",
    "ive",
    "tigerclaw",
    "curie",
    "kotler",
    "porter",
    "tesla",
    "torvalds",
    "nolan",
    "writer",
    "editor",
    "designer",
    "intelligence",
    "source",
    "trace",
    "scout",
  ]);
  if (banned.has(t)) return true;

  // Very short generic tokens.
  if (t.length <= 2) return true;

  return false;
}

function pickOverlayCandidate(raw: string): string | null {
  const cleaned = cleanOverlayText(stripTaskPrefixes(raw));
  if (!cleaned) return null;
  const truncated = truncateWords(cleaned, 120);
  if (!truncated) return null;
  if (isBannedOverlay(truncated)) return null;
  return truncated;
}

function wrapText(input: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = normalizeWhitespace(input).split(" ").filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";
  let wordIndex = 0;
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
      wordIndex += 1;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    wordIndex += 1;
    if (lines.length >= maxLines - 1) break;
  }
  if (lines.length < maxLines && current) lines.push(current);

  if (lines.length > maxLines) return lines.slice(0, maxLines);

  // If we had to stop early, indicate truncation on the last line.
  if (wordIndex < words.length && lines.length > 0) {
    const last = lines[lines.length - 1] ?? "";
    lines[lines.length - 1] = last.endsWith("…") ? last : `${last}…`;
  }
  return lines;
}

export function extractLinkedInOverlayText(task: string, previousOutput: string): string {
  const taskText = (task || "").trim();
  const prevText = (previousOutput || "").trim();
  const haystack = `${taskText}\n\n${prevText}`.trim();

  // Highest priority: explicit hook selection (hard gate).
  const selected = haystack.match(/SELECTED_OVERLAY_HOOK:\s*(.+)$/im);
  if (selected?.[1]) {
    const picked = pickOverlayCandidate(selected[1]);
    if (picked) return picked;
  }

  // Prefer specific article/source titles (common in Scout/RSS trace injected into missions):
  // - **Title**
  //   URL: https://...
  const rssRegex = /-\s*\*\*(.+?)\*\*\s*\n\s*URL:\s*(https?:\/\/\S+)/gi;
  for (const input of [taskText, prevText]) {
    let m: RegExpExecArray | null;
    rssRegex.lastIndex = 0;
    while ((m = rssRegex.exec(input))) {
      const candidate = pickOverlayCandidate(m[1] || "");
      if (candidate) return candidate;
    }
  }

  // Markdown links: [Title](https://...)
  const mdLink = haystack.match(/\[([^\]]{3,200})\]\((https?:\/\/[^\s)]+)\)/i);
  if (mdLink?.[1]) {
    const candidate = pickOverlayCandidate(mdLink[1]);
    if (candidate) return candidate;
  }

  // If the task includes a URL, try to use the nearest preceding bold/heading line as the title.
  const urlIdx = haystack.search(/https?:\/\/\S+/);
  if (urlIdx >= 0) {
    const before = haystack.slice(0, urlIdx);
    const nearBold = before.match(/\*\*(.+?)\*\*\s*$/m);
    if (nearBold?.[1]) {
      const candidate = pickOverlayCandidate(nearBold[1]);
      if (candidate) return candidate;
    }
    const nearHeading = before.match(/^\s{0,3}#{1,3}\s+(.+?)\s*$/m);
    if (nearHeading?.[1]) {
      const candidate = pickOverlayCandidate(nearHeading[1]);
      if (candidate) return candidate;
    }
  }

  // Fallback: use the task title/first line (often contains the topic).
  const taskFirstLine = taskText.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const fromTask = pickOverlayCandidate(taskFirstLine);
  if (fromTask) return fromTask;

  // Then try the first non-empty line from previous output (but avoid agent labels).
  const prevFirstLine = prevText.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const fromPrev = pickOverlayCandidate(prevFirstLine);
  if (fromPrev) return fromPrev;

  // Last resort: first bold line (writer hook).
  const bold = haystack.match(/^\s*\*\*(.+?)\*\*\s*$/m);
  if (bold?.[1]) {
    const candidate = pickOverlayCandidate(bold[1]);
    if (candidate) return candidate;
  }

  // Try to extract a `final_post_text` string from embedded JSON.
  const jsonBlock = haystack.match(/```json\s*([\s\S]*?)\s*```/i);
  if (jsonBlock?.[1]) {
    try {
      const parsed = JSON.parse(jsonBlock[1]) as unknown;
      const candidate = (parsed as { final_post_text?: unknown })?.final_post_text;
      if (typeof candidate === "string" && candidate.trim()) {
        const firstLine = candidate.split("\n").find((l) => l.trim())?.trim() ?? "";
        if (firstLine) {
          const picked = pickOverlayCandidate(firstLine);
          if (picked) return picked;
        }
      }
    } catch {
      // ignore
    }
  }

  return "";
}

export async function generateLinkedInOverlayImage(args: {
  templatePath: string;
  overlayText: string;
  agentName?: string;
}): Promise<{ url: string; localPath: string } | null> {
  const agentName = args.agentName ?? "Ive";
  const templatePath = path.isAbsolute(args.templatePath)
    ? args.templatePath
    : path.resolve(__dirname, "..", args.templatePath);
  if (!templatePath || !fs.existsSync(templatePath)) {
    console.warn(`[LINKEDIN_OVERLAY] Template not found: ${templatePath}`);
    return null;
  }

  const overlayText = normalizeWhitespace(args.overlayText);
  if (!overlayText) {
    console.warn("[LINKEDIN_OVERLAY] Empty overlay text; skipping overlay generation.");
    return null;
  }

  let templateBytes: Buffer;
  try {
    templateBytes = fs.readFileSync(templatePath);
  } catch (e) {
    console.warn(`[LINKEDIN_OVERLAY] Failed to read template: ${templatePath}`, e);
    return null;
  }
  const dims = imageSize(templateBytes);
  const width = dims.width ?? 1200;
  const height = dims.height ?? 627;
  const mime =
    dims.type === "jpg" || dims.type === "jpeg"
      ? "image/jpeg"
      : dims.type === "webp"
        ? "image/webp"
        : "image/png";

  // Conservative sizing tuned to the provided example (2-ish lines, big white type).
  const maxLines = 2;
  const maxCharsPerLine = Math.max(32, Math.min(48, Math.round(width / 45)));
  const lines = wrapText(truncateWords(overlayText, 120), maxCharsPerLine, maxLines);
  const longest = Math.max(...lines.map((l) => l.length), 1);
  const baseFontSize = Math.round(height * 0.14);
  const scaled = Math.round(baseFontSize * Math.min(1, 22 / longest));
  const fontSize = Math.max(54, Math.min(140, scaled));
  const lineHeight = Math.round(fontSize * 1.18);

  // True center alignment (user requirement): horizontally centered, vertically near center.
  const centerX = Math.round(width * 0.5);
  const centerY = Math.round(height * 0.46);
  const startY = Math.round(centerY - ((lines.length - 1) * lineHeight) / 2);

  const templateB64 = templateBytes.toString("base64");

  const textSpans = lines
    .map((line, idx) => {
      const y = startY + idx * lineHeight;
      return `<text x="${centerX}" y="${y}" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="${fontSize}"
        fill="#ffffff" stroke="rgba(0,0,0,0.35)" stroke-width="${Math.max(6, Math.round(fontSize * 0.08))}"
        paint-order="stroke fill" filter="url(#shadow)">${escapeXml(line)}</text>`;
    })
    .join("\n");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="${Math.max(6, Math.round(fontSize * 0.08))}" stdDeviation="${Math.max(3, Math.round(fontSize * 0.05))}" flood-color="rgba(0,0,0,0.35)"/>
    </filter>
  </defs>
  <image href="data:${mime};base64,${templateB64}" x="0" y="0" width="${width}" height="${height}" />
  ${textSpans}
</svg>`;

  const outputDir = path.resolve(__dirname, "..", "public", "generated");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const timestamp = Date.now();
  const filename = `${agentName.toLowerCase()}_linkedin_overlay_${timestamp}.png`;
  const outputPath = path.join(outputDir, filename);

  try {
    const resvg = new Resvg(svg, {
      fitTo: { mode: "original" },
      font: { loadSystemFonts: true },
    });
    const pngData = resvg.render().asPng();
    fs.writeFileSync(outputPath, pngData);
  } catch (e) {
    console.warn("[LINKEDIN_OVERLAY] Render/write failed; skipping overlay generation.", e);
    return null;
  }

  return { url: `/generated/${filename}?t=${timestamp}`, localPath: `/generated/${filename}` };
}
