"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  deriveJobScores,
  extractKeywords,
  normalizeText,
  stripHtml,
  type CandidateProfileForScoring,
} from "../lib/jobSearch";
import { decryptSecret, encryptSecret } from "../lib/secretBox";

type NormalizedPosting = {
  externalJobId: string;
  company: string;
  title: string;
  location: string;
  remoteType: string;
  employmentType?: string;
  url: string;
  description: string;
};

type GmailIntegrationRecord = {
  _id: Id<"email_integrations">;
  provider: string;
  accountEmail: string;
  tokenCiphertext: string;
  refreshCiphertext?: string;
  expiresAt?: number;
  scopes: string[];
  active: boolean;
  lastPolledAt?: number;
  updatedAt: number;
};

type SyncSourceResult = {
  sourceId: Id<"job_sources">;
  provider: string;
  processed: number;
  created: number;
  updated: number;
  shortlisted: number;
  rejected: number;
};

type SignalLinkCandidate = {
  applicationId: Id<"applications">;
  company: string;
  title: string;
  submittedAt: number | null;
  updatedAt: number;
};

function ashbyLocationLabel(
  input: string | { location?: string | null } | null | undefined,
): string | null {
  if (typeof input === "string") {
    const value = input.trim();
    return value || null;
  }
  if (input && typeof input === "object" && typeof input.location === "string") {
    const value = input.location.trim();
    return value || null;
  }
  return null;
}

function detectRemoteType(location: string, description: string, remoteHint?: string): string {
  const haystack = normalizeText(`${location} ${description} ${remoteHint || ""}`);
  if (haystack.includes("hybrid")) return "hybrid";
  if (haystack.includes("remote")) return "remote";
  return "onsite";
}

function cleanJobDescription(input: string): string {
  return stripHtml(input)
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchGreenhousePostings(boardToken: string, company: string): Promise<NormalizedPosting[]> {
  const response = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`,
    {
      headers: {
        accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Greenhouse sync failed (${response.status}) for ${boardToken}`);
  }

  const payload = (await response.json()) as {
    jobs?: Array<{
      id: number;
      title?: string;
      absolute_url?: string;
      location?: { name?: string };
      content?: string;
      updated_at?: string;
    }>;
  };

  return (payload.jobs ?? [])
    .map((job) => {
      const description = cleanJobDescription(job.content ?? "");
      const location = job.location?.name?.trim() || "Unspecified";
      return {
        externalJobId: String(job.id),
        company,
        title: (job.title || "Untitled role").trim(),
        location,
        remoteType: detectRemoteType(location, description),
        url: job.absolute_url || `https://boards.greenhouse.io/${boardToken}/jobs/${job.id}`,
        description,
      } satisfies NormalizedPosting;
    })
    .filter((job) => job.description.length > 80);
}

async function fetchLeverPostings(boardToken: string, company: string): Promise<NormalizedPosting[]> {
  const response = await fetch(
    `https://api.lever.co/v0/postings/${encodeURIComponent(boardToken)}?mode=json`,
    {
      headers: {
        accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Lever sync failed (${response.status}) for ${boardToken}`);
  }

  const payload = (await response.json()) as Array<{
    id: string;
    text?: string;
    description?: string;
    descriptionPlain?: string;
    hostedUrl?: string;
    categories?: {
      commitment?: string;
      location?: string;
      team?: string;
      allLocations?: string[];
    };
    workplaceType?: string;
  }>;

  return payload
    .map((job) => {
      const description = cleanJobDescription(job.descriptionPlain || job.description || "");
      const location = job.categories?.location?.trim() || job.categories?.allLocations?.join(", ") || "Unspecified";
      return {
        externalJobId: job.id,
        company,
        title: (job.text || "Untitled role").trim(),
        location,
        remoteType: detectRemoteType(location, description, job.workplaceType),
        employmentType: job.categories?.commitment?.trim() || undefined,
        url: job.hostedUrl || `https://jobs.lever.co/${boardToken}/${job.id}`,
        description,
      } satisfies NormalizedPosting;
    })
    .filter((job) => job.description.length > 80);
}

async function fetchAshbyPostings(boardToken: string, company: string): Promise<NormalizedPosting[]> {
  const response = await fetch(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardToken)}`,
    {
      headers: {
        accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Ashby sync failed (${response.status}) for ${boardToken}`);
  }

  const payload = (await response.json()) as {
    jobs?: Array<{
      id: string;
      title?: string;
      employmentType?: string;
      location?: string;
      secondaryLocations?: Array<string | { location?: string | null }>;
      isListed?: boolean;
      isRemote?: boolean | null;
      workplaceType?: string | null;
      jobUrl?: string;
      descriptionHtml?: string;
      descriptionPlain?: string;
    }>;
  };

  return (payload.jobs ?? [])
    .filter((job) => job.isListed !== false)
    .map((job) => {
      const description = cleanJobDescription(job.descriptionPlain || job.descriptionHtml || "");
      const locations = [job.location, ...(job.secondaryLocations ?? [])]
        .map((entry) => ashbyLocationLabel(entry))
        .filter((entry): entry is string => Boolean(entry));
      const location = locations.join(" | ") || "Unspecified";
      const remoteHint = [job.workplaceType, job.isRemote ? "remote" : ""].filter(Boolean).join(" ");
      return {
        externalJobId: job.id,
        company,
        title: (job.title || "Untitled role").trim(),
        location,
        remoteType: detectRemoteType(location, description, remoteHint),
        employmentType: job.employmentType?.trim() || undefined,
        url: job.jobUrl || `https://jobs.ashbyhq.com/${boardToken}/${job.id}`,
        description,
      } satisfies NormalizedPosting;
    })
    .filter((job) => job.description.length > 80);
}

async function fetchSourcePostings(source: { provider: string; boardToken: string; name: string }): Promise<NormalizedPosting[]> {
  if (source.provider === "greenhouse") {
    return fetchGreenhousePostings(source.boardToken, source.name);
  }
  if (source.provider === "lever") {
    return fetchLeverPostings(source.boardToken, source.name);
  }
  if (source.provider === "ashby") {
    return fetchAshbyPostings(source.boardToken, source.name);
  }
  throw new Error(`Unsupported job source provider: ${source.provider}`);
}

async function syncSource(ctx: unknown, sourceId: Id<"job_sources">): Promise<SyncSourceResult> {
  const actionCtx = ctx as {
    runQuery: (...args: unknown[]) => Promise<unknown>;
    runMutation: (...args: unknown[]) => Promise<unknown>;
  };
  const source = (await actionCtx.runQuery(api.hiring.getJobSource, { id: sourceId })) as {
    provider: string;
    boardToken: string;
    name: string;
  } | null;
  if (!source) {
    throw new Error("Job source not found.");
  }

  const profile = (await actionCtx.runQuery(api.hiring.getActiveCandidateProfile, {})) as CandidateProfileForScoring | null;
  if (!profile) {
    throw new Error("Import the baseline CV profile before syncing jobs.");
  }

  const postings = await fetchSourcePostings(source);
  let created = 0;
  let updated = 0;
  let shortlisted = 0;
  let rejected = 0;
  const syncedAt = Date.now();

  for (const posting of postings) {
    const score = deriveJobScores({
      company: posting.company,
      title: posting.title,
      location: posting.location,
      remoteType: posting.remoteType,
      description: posting.description,
      candidate: profile,
    });

    const result = (await actionCtx.runMutation(api.hiring.upsertJobPost, {
      sourceId,
      externalJobId: posting.externalJobId,
      company: posting.company,
      title: posting.title,
      location: posting.location,
      remoteType: posting.remoteType,
      employmentType: posting.employmentType,
      url: posting.url,
      description: posting.description,
      keywords: extractKeywords(`${posting.title} ${posting.description}`, 32),
      fitScore: score.fitScore,
      atsScore: score.atsScore,
      status: score.status,
      scoreReason: score.scoreReason,
      matchedKeywords: score.matchedKeywords,
      lastSyncedAt: syncedAt,
    })) as { mode: "created" | "updated" };

    if (result.mode === "created") created += 1;
    if (result.mode === "updated") updated += 1;
    if (score.status === "shortlisted") shortlisted += 1;
    if (score.status === "rejected") rejected += 1;
  }

  await actionCtx.runMutation(api.hiring.markJobSourceSyncSuccess, {
    id: sourceId,
    fetchedAt: syncedAt,
  });

  return {
    sourceId,
    provider: source.provider,
    processed: postings.length,
    created,
    updated,
    shortlisted,
    rejected,
  };
}

function getGoogleClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required for Gmail sync.");
  }
  return { clientId, clientSecret };
}

async function refreshAccessToken(ctx: unknown, integration: GmailIntegrationRecord): Promise<{ accessToken: string; expiresAt: number }> {
  const actionCtx = ctx as {
    runMutation: (...args: unknown[]) => Promise<unknown>;
  };
  if (!integration.refreshCiphertext) {
    throw new Error("Gmail refresh token missing. Reconnect the inbox.");
  }

  const { clientId, clientSecret } = getGoogleClientCredentials();
  const refreshToken = decryptSecret(integration.refreshCiphertext);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to refresh Gmail token (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  const expiresAt = Date.now() + Math.max(payload.expires_in - 60, 60) * 1000;
  const nextRefreshToken = payload.refresh_token ? encryptSecret(payload.refresh_token) : integration.refreshCiphertext;

  await actionCtx.runMutation(api.hiring.updateEmailTokens, {
    id: integration._id,
    tokenCiphertext: encryptSecret(payload.access_token),
    refreshCiphertext: nextRefreshToken,
    expiresAt,
  });

  return {
    accessToken: payload.access_token,
    expiresAt,
  };
}

async function getValidAccessToken(ctx: unknown, integration: GmailIntegrationRecord): Promise<string> {
  const shouldRefresh = !integration.expiresAt || integration.expiresAt <= Date.now() + 60_000;
  if (shouldRefresh) {
    const refreshed = await refreshAccessToken(ctx, integration);
    return refreshed.accessToken;
  }
  return decryptSecret(integration.tokenCiphertext);
}

function classifyInboxSignal(subject: string, snippet: string): { classification: string; confidence: number } {
  const haystack = normalizeText(`${subject} ${snippet}`);

  const offerSignals = ["offer", "compensation", "equity", "we are excited to offer"];
  if (offerSignals.some((signal) => haystack.includes(signal))) {
    return { classification: "offer", confidence: 0.94 };
  }

  const interviewSignals = [
    "interview",
    "schedule",
    "availability",
    "next round",
    "calendar",
    "meet with",
    "screening call",
  ];
  if (interviewSignals.some((signal) => haystack.includes(signal))) {
    return { classification: "interview", confidence: 0.89 };
  }

  const requestInfoSignals = [
    "additional information",
    "take home",
    "assessment",
    "references",
    "please send",
    "complete the following",
  ];
  if (requestInfoSignals.some((signal) => haystack.includes(signal))) {
    return { classification: "request_info", confidence: 0.82 };
  }

  const rejectSignals = [
    "not moving forward",
    "unfortunately",
    "other candidates",
    "will not proceed",
    "regret to inform",
    "not selected",
    "decline",
  ];
  if (rejectSignals.some((signal) => haystack.includes(signal))) {
    return { classification: "reject", confidence: 0.91 };
  }

  return { classification: "other", confidence: 0.45 };
}

function normalizeCompanyKey(input: string): string {
  return normalizeText(input).replace(/\b(inc|llc|ltd|gmbh|b\.v|bv|sa|plc)\b/g, "").replace(/\s+/g, " ").trim();
}

function pickApplicationForSignal(
  subject: string,
  snippet: string,
  senderDomain: string,
  receivedAt: number,
  candidates: SignalLinkCandidate[],
): Id<"applications"> | undefined {
  const haystack = normalizeText(`${subject} ${snippet} ${senderDomain}`);
  let best: { id: Id<"applications">; score: number } | null = null;

  for (const candidate of candidates) {
    const companyKey = normalizeCompanyKey(candidate.company);
    const titleKey = normalizeText(candidate.title);
    let score = 0;

    if (companyKey && haystack.includes(companyKey)) score += 4;
    const domainToken = senderDomain.split(".")[0] || "";
    if (companyKey && domainToken && companyKey.includes(domainToken)) score += 2;
    if (titleKey) {
      const titleTokens = titleKey.split(" ").filter((token) => token.length > 4);
      if (titleTokens.some((token) => haystack.includes(token))) score += 1;
    }
    if (candidate.submittedAt && receivedAt >= candidate.submittedAt) score += 1;
    if (receivedAt >= candidate.updatedAt - 7 * 24 * 60 * 60 * 1000) score += 1;

    if (!best || score > best.score) {
      best = { id: candidate.applicationId, score };
    }
  }

  return best && best.score >= 3 ? best.id : undefined;
}

async function fetchGmailMessages(accessToken: string, query: string): Promise<Array<{
  id: string;
  threadId?: string;
  subject: string;
  sender: string;
  senderDomain: string;
  snippet: string;
  receivedAt: number;
}>> {
  const listResponse = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=${encodeURIComponent(query)}`,
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!listResponse.ok) {
    const body = await listResponse.text();
    throw new Error(`Failed to list Gmail messages (${listResponse.status}): ${body}`);
  }

  const listPayload = (await listResponse.json()) as {
    messages?: Array<{ id: string; threadId?: string }>;
  };

  const messages = listPayload.messages ?? [];
  const details = await Promise.all(
    messages.map(async (message) => {
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        },
      );
      if (!response.ok) return null;
      const payload = (await response.json()) as {
        id: string;
        threadId?: string;
        snippet?: string;
        internalDate?: string;
        payload?: {
          headers?: Array<{ name?: string; value?: string }>;
        };
      };
      const headers = new Map(
        (payload.payload?.headers ?? [])
          .filter((header) => header.name && header.value)
          .map((header) => [String(header.name).toLowerCase(), String(header.value)]),
      );
      const sender = headers.get("from") ?? "unknown";
      const senderDomainMatch = sender.match(/@([^>\s]+)/);
      return {
        id: payload.id,
        threadId: payload.threadId,
        subject: headers.get("subject") ?? "(no subject)",
        sender,
        senderDomain: (senderDomainMatch?.[1] ?? "unknown").toLowerCase(),
        snippet: payload.snippet ?? "",
        receivedAt: Number(payload.internalDate ?? Date.now()),
      };
    }),
  );

  return details.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}

function buildOptimizationSnapshot(input: {
  applications: Array<{
    status: string;
    job: null | { matchedKeywords: string[]; company: string; title: string };
  }>;
  signals: Array<{ classification: string }>;
  periodStart: number;
  periodEnd: number;
}) {
  const classifiedApplications = input.applications.filter((application) => ["interview", "reject", "offer", "request_info"].includes(application.status));
  const interviewApplications = classifiedApplications.filter((application) => application.status === "interview" || application.status === "offer");
  const rejectedApplications = classifiedApplications.filter((application) => application.status === "reject");

  const keywordCounts = (applications: typeof classifiedApplications) => {
    const counts = new Map<string, number>();
    for (const application of applications) {
      for (const keyword of application.job?.matchedKeywords ?? []) {
        counts.set(keyword, (counts.get(keyword) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 8)
      .map(([keyword, count]) => ({ keyword, count }));
  };

  const sampleSize = classifiedApplications.length;
  if (sampleSize < 10) {
    return {
      sampleSize,
      summary: {
        state: "insufficient_data",
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        signalsTracked: input.signals.length,
        classifiedOutcomes: sampleSize,
        message: "Need at least 10 classified outcomes before changing the scoring model.",
      },
      recommendedConfig: {
        keepCurrentThresholds: true,
        fitScoreGate: 0.72,
        atsScoreGate: 0.75,
        nextReviewAfter: "10 classified outcomes",
      },
    };
  }

  const interviewRate = Math.round((interviewApplications.length / Math.max(sampleSize, 1)) * 100);
  const rejectRate = Math.round((rejectedApplications.length / Math.max(sampleSize, 1)) * 100);

  return {
    sampleSize,
    summary: {
      state: "ready",
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      interviewRate,
      rejectRate,
      signalsTracked: input.signals.length,
      topInterviewKeywords: keywordCounts(interviewApplications),
      topRejectedKeywords: keywordCounts(rejectedApplications),
    },
    recommendedConfig: {
      keepCurrentThresholds: interviewRate >= 20,
      fitScoreGate: interviewRate >= 20 ? 0.72 : 0.76,
      atsScoreGate: rejectRate >= 60 ? 0.78 : 0.75,
      focusKeywords: keywordCounts(interviewApplications).map((entry) => entry.keyword),
      cautionKeywords: keywordCounts(rejectedApplications).map((entry) => entry.keyword),
    },
  };
}

export const syncJobSource = action({
  args: {
    sourceId: v.id("job_sources"),
  },
  handler: async (ctx, args): Promise<SyncSourceResult> => {
    try {
      return await syncSource(ctx, args.sourceId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(api.hiring.markJobSourceSyncFailure, {
        id: args.sourceId,
        error: message,
      });
      throw error;
    }
  },
});

export const syncAllActiveJobSources = action({
  args: {},
  handler: async (ctx): Promise<{ syncedSources: number; results: Array<Record<string, unknown>> }> => {
    const sources = (await ctx.runQuery(api.hiring.listJobSources, {})) as Array<{ _id: Id<"job_sources">; active: boolean }>;
    const activeSources = sources.filter((source) => source.active);

    const results = [] as Array<Record<string, unknown>>;
    for (const source of activeSources) {
      try {
        const result = await syncSource(ctx, source._id);
        results.push(result as Record<string, unknown>);
      } catch (error) {
        await ctx.runMutation(api.hiring.markJobSourceSyncFailure, {
          id: source._id,
          error: error instanceof Error ? error.message : String(error),
        });
        results.push({
          sourceId: source._id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      syncedSources: activeSources.length,
      results,
    };
  },
});

export const pollGmailSignals = action({
  args: {},
  handler: async (ctx) => {
    const integration = (await ctx.runQuery(internal.hiring.getEmailIntegrationRecord, {
      provider: "gmail",
    })) as GmailIntegrationRecord | null;

    if (!integration || !integration.active) {
      return {
        ok: false,
        reason: "No active Gmail integration.",
        synced: 0,
      };
    }

    const accessToken = await getValidAccessToken(ctx, integration);
    const candidates = (await ctx.runQuery(api.hiring.getSignalLinkingCandidates, {})) as SignalLinkCandidate[];

    const messages = await fetchGmailMessages(
      accessToken,
      'newer_than:30d (application OR interview OR recruiter OR "thank you for applying" OR unfortunately OR "next steps")',
    );

    let stored = 0;
    const summary: Record<string, number> = {
      reject: 0,
      interview: 0,
      request_info: 0,
      offer: 0,
      other: 0,
    };

    for (const message of messages) {
      const { classification, confidence } = classifyInboxSignal(message.subject, message.snippet);
      const applicationId = pickApplicationForSignal(
        message.subject,
        message.snippet,
        message.senderDomain,
        message.receivedAt,
        candidates,
      );

      await ctx.runMutation(api.hiring.recordInboxSignal, {
        providerMessageId: message.id,
        threadId: message.threadId,
        subject: message.subject,
        sender: message.sender,
        senderDomain: message.senderDomain,
        snippet: message.snippet,
        classification,
        confidence,
        applicationId,
        receivedAt: message.receivedAt,
      });
      stored += 1;
      summary[classification] = (summary[classification] || 0) + 1;
    }

    await ctx.runMutation(api.hiring.updateEmailTokens, {
      id: integration._id,
      tokenCiphertext: integration.tokenCiphertext,
      refreshCiphertext: integration.refreshCiphertext,
      expiresAt: integration.expiresAt,
      lastPolledAt: Date.now(),
    });

    return {
      ok: true,
      synced: stored,
      summary,
    };
  },
});

export const proposeWeeklyOptimization = action({
  args: {},
  handler: async (ctx): Promise<{ snapshotId: unknown; sampleSize: number; summary: Record<string, unknown>; recommendedConfig: Record<string, unknown> }> => {
    const periodEnd = Date.now();
    const periodStart = periodEnd - 28 * 24 * 60 * 60 * 1000;
    const input = (await ctx.runQuery(api.hiring.getOptimizationInput, {
      since: periodStart,
    })) as {
      applications: Array<{
        status: string;
        job: null | { matchedKeywords: string[]; company: string; title: string };
      }>;
      signals: Array<{ classification: string }>;
    };

    const snapshot = buildOptimizationSnapshot({
      applications: input.applications,
      signals: input.signals,
      periodStart,
      periodEnd,
    });

    const snapshotId: unknown = await ctx.runMutation(api.hiring.recordOptimizationSnapshot, {
      periodStart,
      periodEnd,
      sampleSize: snapshot.sampleSize,
      summaryJson: JSON.stringify(snapshot.summary),
      recommendedConfigJson: JSON.stringify(snapshot.recommendedConfig),
      approved: false,
    });

    return {
      snapshotId,
      ...snapshot,
    };
  },
});
