"use node";

import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";

type ParsedCsvRow = {
  activityUrn: string;
  postUrl: string;
  relativeDate?: string;
  impressions: number;
  reactions: number;
  comments: number;
  reposts: number;
  engagements: number;
  engagementRate: number;
  fullText: string;
  hookLine: string;
};

const REQUIRED_HEADERS = [
  "activity_urn",
  "relative_date",
  "impressions",
  "reactions",
  "comments",
  "reposts",
  "full_text",
] as const;

function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === "\"") {
        const next = raw[i + 1];
        if (next === "\"") {
          field += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === "\"") {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (ch === "\r") continue;
    field += ch;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function asNumber(input: string): number {
  const normalized = (input || "").trim().replace(/,/g, "");
  if (!normalized) return 0;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function normalizeWhitespace(input: string): string {
  return (input || "").replace(/\s+/g, " ").trim();
}

function extractHookLine(fullText: string): string {
  const lines = (fullText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return normalizeWhitespace(lines[0] || "");
}

function extractActivityUrn(rawUrn: string): string {
  const input = normalizeWhitespace(rawUrn);
  if (input.startsWith("urn:li:activity:")) return input;

  const match = input.match(/urn:li:activity:\d+/);
  if (match?.[0]) return match[0];

  throw new Error(`Invalid activity URN: ${rawUrn}`);
}

function buildPostUrl(activityUrn: string): string {
  return `https://www.linkedin.com/feed/update/${activityUrn}/`;
}

function parseRowsFromCsv(csvContent: string): ParsedCsvRow[] {
  const grid = parseCsv(csvContent);
  if (grid.length < 2) return [];

  const headers = (grid[0] || []).map((header) => normalizeWhitespace(header).toLowerCase());
  const missing = REQUIRED_HEADERS.filter((required) => !headers.includes(required));
  if (missing.length > 0) {
    throw new Error(`CSV missing required headers: ${missing.join(", ")}`);
  }

  const col = Object.fromEntries(headers.map((header, index) => [header, index])) as Record<string, number>;
  const output: ParsedCsvRow[] = [];

  for (const row of grid.slice(1)) {
    const activityRaw = row[col.activity_urn] || "";
    if (!normalizeWhitespace(activityRaw)) continue;

    const activityUrn = extractActivityUrn(activityRaw);
    const relativeDate = normalizeWhitespace(row[col.relative_date] || "");
    const impressions = asNumber(row[col.impressions] || "");
    const reactions = asNumber(row[col.reactions] || "");
    const comments = asNumber(row[col.comments] || "");
    const reposts = asNumber(row[col.reposts] || "");
    const fullText = (row[col.full_text] || "").trim();
    const engagements = reactions + comments + reposts;
    const engagementRate = impressions > 0 ? engagements / impressions : 0;
    const hookLine = extractHookLine(fullText);

    output.push({
      activityUrn,
      postUrl: buildPostUrl(activityUrn),
      relativeDate: relativeDate || undefined,
      impressions,
      reactions,
      comments,
      reposts,
      engagements,
      engagementRate,
      fullText,
      hookLine,
    });
  }

  return output;
}

export const importCsv = action({
  args: {
    csvContent: v.string(),
    sourceFile: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    inserted: number;
    updated: number;
    total: number;
    importedAt: number;
    parsedRows: number;
    sourceFile: string | null;
  }> => {
    const rows = parseRowsFromCsv(args.csvContent);
    const importedAt = Date.now();
    const result: { inserted: number; updated: number; total: number } = await ctx.runMutation(api.linkedinAnalytics.upsertBatch, {
      rows,
      sourceFile: args.sourceFile,
      importedAt,
    });

    return {
      ...result,
      importedAt,
      parsedRows: rows.length,
      sourceFile: args.sourceFile || null,
    };
  },
});
