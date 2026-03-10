import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

type TextFeatures = {
  chars: number;
  lines: number;
  paragraphs: number;
  hasBullets: boolean;
  endsWithQuestion: boolean;
  hasFirstPerson: boolean;
  hasNumbers: boolean;
  hasEmoji: boolean;
  avgSentenceWords: number;
};

function normalizeWhitespace(input: string): string {
  return (input || "").replace(/\s+/g, " ").trim();
}

function firstMeaningfulLine(input: string): string {
  const lines = (input || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return normalizeWhitespace(lines[0] || "");
}

function analyzeText(input: string): TextFeatures {
  const text = input || "";
  const normalized = normalizeWhitespace(text);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const sentences = normalized
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const sentenceWordCounts = sentences.map((sentence) =>
    sentence.split(/\s+/).filter(Boolean).length,
  );
  const avgSentenceWords = sentenceWordCounts.length
    ? sentenceWordCounts.reduce((sum, words) => sum + words, 0) / sentenceWordCounts.length
    : 0;

  return {
    chars: normalized.length,
    lines: lines.length,
    paragraphs: paragraphs.length,
    hasBullets: /(?:^|\n)\s*(?:[-*•]\s+|\d+\.\s+)/.test(text),
    endsWithQuestion: /\?\s*$/.test(text.trim()),
    hasFirstPerson: /\b(i|my|me|we|our|us)\b/i.test(text),
    hasNumbers: /\b\d[\d,]*(?:\.\d+)?\b/.test(text),
    hasEmoji: /[\u{1F300}-\u{1FAFF}]/u.test(text),
    avgSentenceWords,
  };
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function proportion(values: boolean[]): number {
  if (!values.length) return 0;
  const count = values.reduce((sum, value) => sum + (value ? 1 : 0), 0);
  return count / values.length;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

export const upsertBatch = mutation({
  args: {
    rows: v.array(
      v.object({
        activityUrn: v.string(),
        postUrl: v.string(),
        relativeDate: v.optional(v.string()),
        impressions: v.number(),
        reactions: v.number(),
        comments: v.number(),
        reposts: v.number(),
        engagements: v.number(),
        engagementRate: v.number(),
        fullText: v.string(),
        hookLine: v.string(),
      }),
    ),
    sourceFile: v.optional(v.string()),
    importedAt: v.number(),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;

    for (const row of args.rows) {
      const existing = await ctx.db
        .query("linkedin_post_analytics")
        .withIndex("by_activityUrn", (q) => q.eq("activityUrn", row.activityUrn))
        .first();

      if (!existing) {
        await ctx.db.insert("linkedin_post_analytics", {
          ...row,
          sourceFile: args.sourceFile,
          importCount: 1,
          firstSeenAt: args.importedAt,
          lastImportedAt: args.importedAt,
          updatedAt: args.importedAt,
          createdAt: args.importedAt,
        });
        inserted += 1;
        continue;
      }

      await ctx.db.patch(existing._id, {
        ...row,
        sourceFile: args.sourceFile || existing.sourceFile,
        importCount: (existing.importCount || 0) + 1,
        firstSeenAt: existing.firstSeenAt || args.importedAt,
        lastImportedAt: args.importedAt,
        updatedAt: args.importedAt,
      });
      updated += 1;
    }

    return { inserted, updated, total: args.rows.length };
  },
});

export const getSummary = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("linkedin_post_analytics").collect();
    const totalPosts = rows.length;
    const totalImpressions = rows.reduce((sum, row) => sum + (row.impressions || 0), 0);
    const totalEngagements = rows.reduce((sum, row) => sum + (row.engagements || 0), 0);
    const averageEngagementRate = totalImpressions > 0 ? totalEngagements / totalImpressions : 0;

    const lastImportedAt = rows.reduce((max, row) => Math.max(max, row.lastImportedAt || 0), 0);
    return {
      totalPosts,
      totalImpressions,
      totalEngagements,
      averageEngagementRate,
      lastImportedAt: lastImportedAt || null,
    };
  },
});

export const listTopPosts = query({
  args: {
    metric: v.optional(v.union(v.literal("engagement_rate"), v.literal("impressions"), v.literal("engagements"))),
    limit: v.optional(v.number()),
    minImpressions: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const metric = args.metric || "engagement_rate";
    const limit = Math.max(1, Math.min(50, args.limit || 10));
    const minImpressions = Math.max(0, args.minImpressions || 0);

    const rows = await ctx.db.query("linkedin_post_analytics").collect();
    const eligible = rows.filter((row) => (row.impressions || 0) >= minImpressions);

    const sorted = [...eligible].sort((a, b) => {
      if (metric === "impressions") return (b.impressions || 0) - (a.impressions || 0);
      if (metric === "engagements") return (b.engagements || 0) - (a.engagements || 0);
      const diff = (b.engagementRate || 0) - (a.engagementRate || 0);
      if (diff !== 0) return diff;
      return (b.impressions || 0) - (a.impressions || 0);
    });

    return sorted.slice(0, limit).map((row) => ({
      activityUrn: row.activityUrn,
      postUrl: row.postUrl,
      hookLine: row.hookLine,
      impressions: row.impressions,
      engagements: row.engagements,
      engagementRate: row.engagementRate,
      relativeDate: row.relativeDate || null,
    }));
  },
});

export const getWritingGuidance = query({
  args: {
    minImpressions: v.optional(v.number()),
    topN: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const minImpressions = Math.max(100, args.minImpressions || 300);
    const topN = Math.max(1, Math.min(8, args.topN || 3));
    const rows = await ctx.db.query("linkedin_post_analytics").collect();
    const eligible = rows.filter((row) => (row.impressions || 0) >= minImpressions && !!row.hookLine);

    const byBest = [...eligible].sort((a, b) => {
      const diff = (b.engagementRate || 0) - (a.engagementRate || 0);
      if (diff !== 0) return diff;
      return (b.impressions || 0) - (a.impressions || 0);
    });

    const byWorst = [...eligible].sort((a, b) => {
      const diff = (a.engagementRate || 0) - (b.engagementRate || 0);
      if (diff !== 0) return diff;
      return (b.impressions || 0) - (a.impressions || 0);
    });

    const topHooks = byBest.slice(0, topN).map((row) => ({
      hookLine: row.hookLine,
      engagementRate: row.engagementRate,
      impressions: row.impressions,
    }));
    const weakHooks = byWorst.slice(0, topN).map((row) => ({
      hookLine: row.hookLine,
      engagementRate: row.engagementRate,
      impressions: row.impressions,
    }));

    const totalImpressions = eligible.reduce((sum, row) => sum + (row.impressions || 0), 0);
    const totalEngagements = eligible.reduce((sum, row) => sum + (row.engagements || 0), 0);
    const baselineRate = totalImpressions > 0 ? totalEngagements / totalImpressions : 0;

    return {
      datasetSize: eligible.length,
      minImpressions,
      baselineRate,
      topHooks,
      weakHooks,
    };
  },
});

export const getWritingPlaybook = query({
  args: {
    minImpressions: v.optional(v.number()),
    sampleSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const minImpressions = Math.max(100, args.minImpressions || 300);
    const sampleSize = Math.max(2, Math.min(8, args.sampleSize || 4));

    const rows = await ctx.db.query("linkedin_post_analytics").collect();
    const eligible = rows.filter((row) => (row.impressions || 0) >= minImpressions && !!row.fullText);

    const ranked = [...eligible].sort((a, b) => {
      const diff = (b.engagementRate || 0) - (a.engagementRate || 0);
      if (diff !== 0) return diff;
      return (b.impressions || 0) - (a.impressions || 0);
    });

    const top = ranked.slice(0, sampleSize);
    const weak = [...ranked].reverse().slice(0, sampleSize);

    const topFeatures = top.map((row) => analyzeText(row.fullText || ""));
    const weakFeatures = weak.map((row) => analyzeText(row.fullText || ""));

    const topSummary = {
      avgChars: average(topFeatures.map((feature) => feature.chars)),
      medianChars: median(topFeatures.map((feature) => feature.chars)),
      avgLines: average(topFeatures.map((feature) => feature.lines)),
      avgParagraphs: average(topFeatures.map((feature) => feature.paragraphs)),
      bulletRate: proportion(topFeatures.map((feature) => feature.hasBullets)),
      questionEndingRate: proportion(topFeatures.map((feature) => feature.endsWithQuestion)),
      firstPersonRate: proportion(topFeatures.map((feature) => feature.hasFirstPerson)),
      numberRate: proportion(topFeatures.map((feature) => feature.hasNumbers)),
      emojiRate: proportion(topFeatures.map((feature) => feature.hasEmoji)),
      avgSentenceWords: average(topFeatures.map((feature) => feature.avgSentenceWords)),
    };

    const weakSummary = {
      avgChars: average(weakFeatures.map((feature) => feature.chars)),
      medianChars: median(weakFeatures.map((feature) => feature.chars)),
      avgLines: average(weakFeatures.map((feature) => feature.lines)),
      avgParagraphs: average(weakFeatures.map((feature) => feature.paragraphs)),
      bulletRate: proportion(weakFeatures.map((feature) => feature.hasBullets)),
      questionEndingRate: proportion(weakFeatures.map((feature) => feature.endsWithQuestion)),
      firstPersonRate: proportion(weakFeatures.map((feature) => feature.hasFirstPerson)),
      numberRate: proportion(weakFeatures.map((feature) => feature.hasNumbers)),
      emojiRate: proportion(weakFeatures.map((feature) => feature.hasEmoji)),
      avgSentenceWords: average(weakFeatures.map((feature) => feature.avgSentenceWords)),
    };

    const doMore: string[] = [];
    const avoid: string[] = [];

    if (topSummary.firstPersonRate - weakSummary.firstPersonRate > 0.2) {
      doMore.push("Anchor the opener in personal operator perspective (I/we) before abstraction.");
    }
    if (topSummary.bulletRate - weakSummary.bulletRate > 0.2) {
      doMore.push("Use concise bullet breakdowns to make the core mechanism scannable.");
    }
    if (topSummary.questionEndingRate - weakSummary.questionEndingRate > 0.15) {
      doMore.push("Close with one specific decision question to invite comments.");
    }
    if (topSummary.numberRate - weakSummary.numberRate > 0.2) {
      doMore.push("Include concrete numbers or ranges early to increase credibility.");
    }
    if (topSummary.avgParagraphs < weakSummary.avgParagraphs - 0.8) {
      avoid.push("Over-fragmented post flow; merge micro-paragraphs into clearer narrative blocks.");
    }
    if (topSummary.avgSentenceWords + 3 < weakSummary.avgSentenceWords) {
      avoid.push("Long winding sentences; keep sentence length tighter and more declarative.");
    }
    if (topSummary.avgChars + 220 < weakSummary.avgChars) {
      avoid.push("Overwriting; trim filler and focus on one sharp claim + one proof.");
    }

    if (doMore.length === 0) {
      doMore.push("Keep a high-contrast hook, then quickly translate to operational implications.");
    }
    if (avoid.length === 0) {
      avoid.push("Avoid generic, label-only framing that lacks a clear mechanism or stake.");
    }

    const topExamples = top.map((row) => ({
      postUrl: row.postUrl,
      hookLine: firstMeaningfulLine(row.fullText || row.hookLine || ""),
      excerpt: normalizeWhitespace((row.fullText || "").slice(0, 340)),
      impressions: row.impressions,
      engagementRate: row.engagementRate,
    }));

    const weakExamples = weak.map((row) => ({
      postUrl: row.postUrl,
      hookLine: firstMeaningfulLine(row.fullText || row.hookLine || ""),
      excerpt: normalizeWhitespace((row.fullText || "").slice(0, 260)),
      impressions: row.impressions,
      engagementRate: row.engagementRate,
    }));

    const totalImpressions = eligible.reduce((sum, row) => sum + (row.impressions || 0), 0);
    const totalEngagements = eligible.reduce((sum, row) => sum + (row.engagements || 0), 0);
    const baselineRate = totalImpressions > 0 ? totalEngagements / totalImpressions : 0;

    return {
      datasetSize: eligible.length,
      minImpressions,
      sampleSize,
      baselineRate,
      topSummary,
      weakSummary,
      doMore,
      avoid,
      topExamples,
      weakExamples,
    };
  },
});
