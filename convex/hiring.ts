import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

function byUpdatedDesc<T extends { updatedAt: number }>(left: T, right: T): number {
  return right.updatedAt - left.updatedAt;
}

function safeJsonParse<T>(input: string, fallback: T): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

function parseScreeningAnswers(input: string): string[] {
  const parsed = safeJsonParse<unknown>(input, input);
  if (Array.isArray(parsed)) {
    return parsed.filter((entry): entry is string => typeof entry === "string");
  }
  if (typeof parsed === "string") {
    return parsed
      .split(/\n{2,}|\n-\s+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function markdownToPlain(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function latest<T extends { updatedAt: number }>(items: T[]): T | null {
  if (items.length === 0) return null;
  return [...items].sort(byUpdatedDesc)[0] ?? null;
}

async function getActiveProfile(ctx: unknown) {
  const queryCtx = ctx as {
    db: {
      query: (...args: unknown[]) => {
        withIndex: (...args: unknown[]) => {
          collect: () => Promise<Array<Doc<"candidate_profiles">>>;
        };
      };
    };
  };
  const profiles = await queryCtx.db
    .query("candidate_profiles")
    .withIndex("by_active", (q: { eq: (field: "active", value: boolean) => unknown }) => q.eq("active", true))
    .collect();
  return latest(profiles);
}

function resolveSourceUrl(provider: string, boardToken: string, fallback?: string): string {
  if (fallback && fallback.trim()) return fallback.trim();
  if (provider === "greenhouse") return `https://boards.greenhouse.io/${boardToken}`;
  if (provider === "lever") return `https://jobs.lever.co/${boardToken}`;
  if (provider === "ashby") return `https://jobs.ashbyhq.com/${boardToken}`;
  return boardToken;
}

export const getActiveCandidateProfile = query({
  args: {},
  handler: async (ctx) => {
    return getActiveProfile(ctx);
  },
});

export const listJobSources = query({
  args: {},
  handler: async (ctx) => {
    const sources = await ctx.db.query("job_sources").collect();
    return sources.sort(byUpdatedDesc);
  },
});

export const getJobSource = query({
  args: { id: v.id("job_sources") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

export const listJobPosts = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const jobs = args.status && args.status !== "all"
      ? await ctx.db
          .query("job_posts")
          .withIndex("by_status", (q) => q.eq("status", args.status as string))
          .collect()
      : await ctx.db.query("job_posts").collect();

    const sources = await ctx.db.query("job_sources").collect();
    const sourceMap = new Map(sources.map((source) => [String(source._id), source]));
    const applications = await ctx.db.query("applications").collect();
    const applicationByJob = new Map(applications.map((application) => [String(application.jobPostId), application]));

    const rows = jobs
      .map((job) => {
        const source = sourceMap.get(String(job.sourceId));
        const application = applicationByJob.get(String(job._id));
        return {
          ...job,
          sourceName: source?.name ?? null,
          sourceProvider: source?.provider ?? null,
          applicationId: application?._id ?? null,
          applicationStatus: application?.status ?? null,
        };
      })
      .sort((left, right) => {
        if (right.fitScore !== left.fitScore) return right.fitScore - left.fitScore;
        if (right.atsScore !== left.atsScore) return right.atsScore - left.atsScore;
        return right.updatedAt - left.updatedAt;
      });

    return typeof args.limit === "number" ? rows.slice(0, args.limit) : rows;
  },
});

export const getJobPost = query({
  args: { id: v.id("job_posts") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (!job) return null;

    const source = await ctx.db.get(job.sourceId);
    const applications = await ctx.db
      .query("applications")
      .withIndex("by_job_post", (q) => q.eq("jobPostId", args.id))
      .collect();
    const application = latest(applications);

    return {
      ...job,
      source,
      applicationId: application?._id ?? null,
      applicationStatus: application?.status ?? null,
    };
  },
});

export const getPackagingContext = query({
  args: { jobPostId: v.id("job_posts") },
  handler: async (ctx, args) => {
    const profile = await getActiveProfile(ctx);
    const job = await ctx.db.get(args.jobPostId);
    if (!job) return null;

    const source = await ctx.db.get(job.sourceId);
    const applications = await ctx.db
      .query("applications")
      .withIndex("by_job_post", (q) => q.eq("jobPostId", args.jobPostId))
      .collect();
    const application = latest(applications);
    const resumeVariant = application ? await ctx.db.get(application.resumeVariantId) : null;

    return {
      profile,
      job,
      source,
      application,
      resumeVariant,
    };
  },
});

export const listApplications = query({
  args: {
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const applications = args.status && args.status !== "all"
      ? await ctx.db
          .query("applications")
          .withIndex("by_status", (q) => q.eq("status", args.status as string))
          .collect()
      : await ctx.db.query("applications").collect();

    const jobs = await ctx.db.query("job_posts").collect();
    const jobMap = new Map(jobs.map((job) => [String(job._id), job]));
    const resumeVariants = await ctx.db.query("resume_variants").collect();
    const resumeMap = new Map(resumeVariants.map((variant) => [String(variant._id), variant]));
    const sources = await ctx.db.query("job_sources").collect();
    const sourceMap = new Map(sources.map((source) => [String(source._id), source]));
    const signals = await ctx.db.query("inbox_signals").collect();

    return applications
      .map((application) => {
        const job = jobMap.get(String(application.jobPostId));
        const resumeVariant = resumeMap.get(String(application.resumeVariantId));
        const source = job ? sourceMap.get(String(job.sourceId)) : null;
        const applicationSignals = signals
          .filter((signal) => String(signal.applicationId) === String(application._id))
          .sort((left, right) => right.receivedAt - left.receivedAt);

        return {
          ...application,
          job,
          source,
          resumeVariant,
          signalCount: applicationSignals.length,
          latestSignal: applicationSignals[0] ?? null,
        };
      })
      .sort((left, right) => right.updatedAt - left.updatedAt);
  },
});

export const getApplication = query({
  args: { id: v.id("applications") },
  handler: async (ctx, args) => {
    const application = await ctx.db.get(args.id);
    if (!application) return null;

    const job = await ctx.db.get(application.jobPostId);
    const source = job ? await ctx.db.get(job.sourceId) : null;
    const resumeVariant = await ctx.db.get(application.resumeVariantId);
    const signals = await ctx.db
      .query("inbox_signals")
      .withIndex("by_application", (q) => q.eq("applicationId", args.id))
      .collect();

    return {
      application,
      job,
      source,
      resumeVariant,
      screeningAnswersList: parseScreeningAnswers(application.screeningAnswers),
      atsChecklist: resumeVariant?.atsChecklist ?? [],
      truthAudit: resumeVariant?.truthAudit ?? [],
      signals: signals.sort((left, right) => right.receivedAt - left.receivedAt),
    };
  },
});

export const getEmailIntegration = query({
  args: {
    provider: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const integrations = args.provider
      ? await ctx.db
          .query("email_integrations")
          .withIndex("by_provider", (q) => q.eq("provider", args.provider as string))
          .collect()
      : await ctx.db.query("email_integrations").collect();

    const integration = latest(
      integrations.filter((entry) => (args.provider ? entry.provider === args.provider : true) && entry.active),
    );
    if (!integration) return null;

    return {
      _id: integration._id,
      provider: integration.provider,
      accountEmail: integration.accountEmail,
      active: integration.active,
      expiresAt: integration.expiresAt ?? null,
      scopes: integration.scopes,
      lastPolledAt: integration.lastPolledAt ?? null,
      updatedAt: integration.updatedAt,
    };
  },
});

export const getEmailIntegrationRecord = internalQuery({
  args: {
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    const integrations = await ctx.db
      .query("email_integrations")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider.trim().toLowerCase()))
      .collect();

    return latest(integrations.filter((integration) => integration.active));
  },
});

export const listInboxSignals = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const signals = await ctx.db
      .query("inbox_signals")
      .withIndex("by_receivedAt")
      .collect();

    const rows = signals.sort((left, right) => right.receivedAt - left.receivedAt);
    return typeof args.limit === "number" ? rows.slice(0, args.limit) : rows;
  },
});

export const listOptimizationSnapshots = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const snapshots = await ctx.db.query("optimization_snapshots").collect();
    const rows = snapshots
      .sort((left, right) => right.periodEnd - left.periodEnd)
      .map((snapshot) => ({
        ...snapshot,
        summary: safeJsonParse<Record<string, unknown>>(snapshot.summaryJson, {}),
        recommendedConfig: safeJsonParse<Record<string, unknown>>(snapshot.recommendedConfigJson, {}),
      }));

    return typeof args.limit === "number" ? rows.slice(0, args.limit) : rows;
  },
});

export const getDashboardSummary = query({
  args: {},
  handler: async (ctx) => {
    const profile = await getActiveProfile(ctx);
    const sources = await ctx.db.query("job_sources").collect();
    const jobs = await ctx.db.query("job_posts").collect();
    const applications = await ctx.db.query("applications").collect();
    const signals = await ctx.db.query("inbox_signals").collect();
    const emailIntegration = await ctx.db
      .query("email_integrations")
      .withIndex("by_provider", (q) => q.eq("provider", "gmail"))
      .collect();

    return {
      hasProfile: Boolean(profile),
      activeSourceCount: sources.filter((source) => source.active).length,
      totalSources: sources.length,
      totalJobs: jobs.length,
      shortlistedJobs: jobs.filter((job) => job.status === "shortlisted" || job.status === "package_ready").length,
      totalApplications: applications.length,
      awaitingApproval: applications.filter((application) => application.status === "awaiting_approval").length,
      submitted: applications.filter((application) => application.status === "submitted").length,
      interviews: applications.filter((application) => application.status === "interview").length,
      rejects: applications.filter((application) => application.status === "reject").length,
      signalsLast30Days: signals.filter((signal) => signal.receivedAt >= Date.now() - 30 * 24 * 60 * 60 * 1000).length,
      hasEmailIntegration: emailIntegration.some((integration) => integration.active),
    };
  },
});

export const getSignalLinkingCandidates = query({
  args: {},
  handler: async (ctx) => {
    const applications = await ctx.db.query("applications").collect();
    const jobs = await ctx.db.query("job_posts").collect();
    const jobMap = new Map(jobs.map((job) => [String(job._id), job]));

    return applications.map((application) => {
      const job = jobMap.get(String(application.jobPostId));
      return {
        applicationId: application._id,
        status: application.status,
        submittedAt: application.submittedAt ?? null,
        updatedAt: application.updatedAt,
        company: job?.company ?? "",
        title: job?.title ?? "",
      };
    });
  },
});

export const getOptimizationInput = query({
  args: {
    since: v.number(),
  },
  handler: async (ctx, args) => {
    const applications = await ctx.db.query("applications").collect();
    const jobs = await ctx.db.query("job_posts").collect();
    const jobMap = new Map(jobs.map((job) => [String(job._id), job]));
    const signals = await ctx.db.query("inbox_signals").collect();

    return {
      applications: applications
        .filter((application) => (application.submittedAt ?? application.updatedAt) >= args.since)
        .map((application) => ({
          ...application,
          job: jobMap.get(String(application.jobPostId)) ?? null,
        })),
      signals: signals.filter((signal) => signal.receivedAt >= args.since),
    };
  },
});

export const upsertCandidateProfile = mutation({
  args: {
    displayName: v.string(),
    roleTrack: v.string(),
    summary: v.string(),
    aggregatedText: v.string(),
    keywords: v.array(v.string()),
    sourceFiles: v.array(v.string()),
    evidenceExcerpts: v.array(
      v.object({
        sourceFile: v.string(),
        excerpt: v.string(),
      }),
    ),
    preferredLocations: v.array(v.string()),
    workModes: v.array(v.string()),
    exactMatchGlobal: v.boolean(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const profiles = await ctx.db.query("candidate_profiles").collect();
    const existing = latest(
      profiles.filter(
        (profile) =>
          profile.displayName === args.displayName && profile.roleTrack === args.roleTrack,
      ),
    );

    if (args.active) {
      await Promise.all(
        profiles
          .filter((profile) => profile.active && (!existing || profile._id !== existing._id))
          .map((profile) => ctx.db.patch(profile._id, { active: false, updatedAt: now })),
      );
    }

    const payload = {
      displayName: args.displayName,
      roleTrack: args.roleTrack,
      summary: args.summary,
      aggregatedText: args.aggregatedText,
      keywords: args.keywords,
      sourceFiles: args.sourceFiles,
      evidenceExcerpts: args.evidenceExcerpts,
      preferredLocations: args.preferredLocations,
      workModes: args.workModes,
      exactMatchGlobal: args.exactMatchGlobal,
      active: args.active,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return ctx.db.insert("candidate_profiles", payload);
  },
});

export const upsertJobSource = mutation({
  args: {
    id: v.optional(v.id("job_sources")),
    name: v.string(),
    provider: v.string(),
    boardToken: v.string(),
    url: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const boardToken = args.boardToken.trim();
    const provider = args.provider.trim().toLowerCase();
    const nextUrl = resolveSourceUrl(provider, boardToken, args.url);

    const existing = args.id
      ? await ctx.db.get(args.id)
      : (
          await ctx.db
            .query("job_sources")
            .withIndex("by_provider_token", (q) => q.eq("provider", provider).eq("boardToken", boardToken))
            .collect()
        )[0] ?? null;

    const payload = {
      name: args.name.trim(),
      provider,
      boardToken,
      url: nextUrl,
      active: args.active ?? true,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return ctx.db.insert("job_sources", {
      ...payload,
      createdAt: now,
    });
  },
});

export const toggleJobSource = mutation({
  args: {
    id: v.id("job_sources"),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      active: args.active,
      updatedAt: Date.now(),
    });
    return args.id;
  },
});

export const markJobSourceSyncSuccess = mutation({
  args: {
    id: v.id("job_sources"),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      lastFetchedAt: args.fetchedAt,
      lastError: null,
      lastErrorAt: null,
      updatedAt: args.fetchedAt,
    });
  },
});

export const markJobSourceSyncFailure = mutation({
  args: {
    id: v.id("job_sources"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.id, {
      lastError: args.error,
      lastErrorAt: now,
      updatedAt: now,
    });
  },
});

export const upsertJobPost = mutation({
  args: {
    sourceId: v.id("job_sources"),
    externalJobId: v.string(),
    company: v.string(),
    title: v.string(),
    location: v.string(),
    remoteType: v.string(),
    employmentType: v.optional(v.string()),
    url: v.string(),
    description: v.string(),
    keywords: v.array(v.string()),
    fitScore: v.number(),
    atsScore: v.number(),
    status: v.string(),
    scoreReason: v.string(),
    matchedKeywords: v.array(v.string()),
    lastSyncedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = (
      await ctx.db
        .query("job_posts")
        .withIndex("by_source_external", (q) => q.eq("sourceId", args.sourceId).eq("externalJobId", args.externalJobId))
        .collect()
    )[0] ?? null;

    const stickyStatuses = new Set(["package_ready", "submitted", "interview", "offer"]);
    const nextStatus = existing && stickyStatuses.has(existing.status) ? existing.status : args.status;

    const payload = {
      sourceId: args.sourceId,
      externalJobId: args.externalJobId,
      company: args.company,
      title: args.title,
      location: args.location,
      remoteType: args.remoteType,
      employmentType: args.employmentType,
      url: args.url,
      description: args.description,
      keywords: args.keywords,
      fitScore: args.fitScore,
      atsScore: args.atsScore,
      status: nextStatus,
      scoreReason: args.scoreReason,
      matchedKeywords: args.matchedKeywords,
      updatedAt: now,
      lastSyncedAt: args.lastSyncedAt,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { id: existing._id, mode: "updated" as const };
    }

    const id = await ctx.db.insert("job_posts", {
      ...payload,
      createdAt: now,
    });
    return { id, mode: "created" as const };
  },
});

export const saveApplicationPackage = mutation({
  args: {
    jobPostId: v.id("job_posts"),
    profileId: v.id("candidate_profiles"),
    variantType: v.string(),
    contentMarkdown: v.string(),
    contentPlain: v.string(),
    atsChecklist: v.array(v.string()),
    truthAudit: v.array(
      v.object({
        sourceFile: v.string(),
        excerpt: v.string(),
      }),
    ),
    coverLetter: v.string(),
    screeningAnswers: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existingApplications = await ctx.db
      .query("applications")
      .withIndex("by_job_post", (q) => q.eq("jobPostId", args.jobPostId))
      .collect();
    const existingApplication = latest(existingApplications);

    let resumeVariantId = existingApplication?.resumeVariantId ?? null;
    if (resumeVariantId) {
      await ctx.db.patch(resumeVariantId, {
        profileId: args.profileId,
        jobPostId: args.jobPostId,
        variantType: args.variantType,
        contentMarkdown: args.contentMarkdown,
        contentPlain: args.contentPlain,
        atsChecklist: args.atsChecklist,
        truthAudit: args.truthAudit,
        updatedAt: now,
      });
    } else {
      resumeVariantId = await ctx.db.insert("resume_variants", {
        profileId: args.profileId,
        jobPostId: args.jobPostId,
        variantType: args.variantType,
        contentMarkdown: args.contentMarkdown,
        contentPlain: args.contentPlain,
        atsChecklist: args.atsChecklist,
        truthAudit: args.truthAudit,
        createdAt: now,
        updatedAt: now,
      });
    }

    const stickyStatuses = new Set(["submitted", "interview", "offer", "reject", "request_info"]);
    let applicationId = existingApplication?._id ?? null;
    const nextStatus = existingApplication && stickyStatuses.has(existingApplication.status)
      ? existingApplication.status
      : "awaiting_approval";

    if (applicationId) {
      await ctx.db.patch(applicationId, {
        resumeVariantId,
        coverLetter: args.coverLetter,
        screeningAnswers: args.screeningAnswers,
        status: nextStatus,
        updatedAt: now,
      });
    } else {
      applicationId = await ctx.db.insert("applications", {
        jobPostId: args.jobPostId,
        resumeVariantId,
        coverLetter: args.coverLetter,
        screeningAnswers: args.screeningAnswers,
        status: "awaiting_approval",
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(args.jobPostId, {
      status: "package_ready",
      updatedAt: now,
    });

    return {
      applicationId,
      resumeVariantId,
      status: nextStatus,
    };
  },
});

export const updateApplicationStatus = mutation({
  args: {
    id: v.id("applications"),
    status: v.string(),
    notes: v.optional(v.string()),
    approvalNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const application = await ctx.db.get(args.id);
    if (!application) throw new Error("Application not found.");

    const now = Date.now();
    const patch: Partial<Doc<"applications">> = {
      status: args.status,
      updatedAt: now,
    };
    if (typeof args.notes === "string") patch.notes = args.notes;
    if (typeof args.approvalNotes === "string") patch.approvalNotes = args.approvalNotes;
    if (args.status === "submitted" && !application.submittedAt) patch.submittedAt = now;

    await ctx.db.patch(args.id, patch);

    const jobStatusByApplication: Record<string, string> = {
      awaiting_approval: "package_ready",
      approved: "package_ready",
      submitted: "submitted",
      interview: "interview",
      offer: "offer",
      reject: "rejected",
      request_info: "submitted",
    };

    await ctx.db.patch(application.jobPostId, {
      status: jobStatusByApplication[args.status] ?? "package_ready",
      updatedAt: now,
    });

    return args.id;
  },
});

export const updateResumeVariantContent = mutation({
  args: {
    id: v.id("resume_variants"),
    contentMarkdown: v.string(),
  },
  handler: async (ctx, args) => {
    const resumeVariant = await ctx.db.get(args.id);
    if (!resumeVariant) throw new Error("Resume variant not found.");

    const now = Date.now();
    await ctx.db.patch(args.id, {
      contentMarkdown: args.contentMarkdown,
      contentPlain: markdownToPlain(args.contentMarkdown),
      updatedAt: now,
    });

    const relatedApplications = await ctx.db
      .query("applications")
      .withIndex("by_job_post", (q) => q.eq("jobPostId", resumeVariant.jobPostId))
      .collect();

    await Promise.all(
      relatedApplications
        .filter((application) => application.resumeVariantId === args.id)
        .map((application) =>
          ctx.db.patch(application._id, {
            updatedAt: now,
          }),
        ),
    );

    return args.id;
  },
});

export const saveEmailIntegration = mutation({
  args: {
    provider: v.string(),
    accountEmail: v.string(),
    tokenCiphertext: v.string(),
    refreshCiphertext: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    scopes: v.array(v.string()),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const provider = args.provider.trim().toLowerCase();
    const integrations = await ctx.db
      .query("email_integrations")
      .withIndex("by_provider", (q) => q.eq("provider", provider))
      .collect();

    await Promise.all(
      integrations
        .filter((integration) => integration.accountEmail !== args.accountEmail && integration.active)
        .map((integration) => ctx.db.patch(integration._id, { active: false, updatedAt: now })),
    );

    const existing = integrations.find((integration) => integration.accountEmail === args.accountEmail) ?? null;
    const payload = {
      provider,
      accountEmail: args.accountEmail,
      tokenCiphertext: args.tokenCiphertext,
      refreshCiphertext: args.refreshCiphertext,
      expiresAt: args.expiresAt,
      scopes: args.scopes,
      active: args.active,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return ctx.db.insert("email_integrations", payload);
  },
});

export const updateEmailTokens = mutation({
  args: {
    id: v.id("email_integrations"),
    tokenCiphertext: v.string(),
    refreshCiphertext: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    lastPolledAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      tokenCiphertext: args.tokenCiphertext,
      refreshCiphertext: args.refreshCiphertext,
      expiresAt: args.expiresAt,
      lastPolledAt: args.lastPolledAt,
      updatedAt: Date.now(),
    });
    return args.id;
  },
});

export const deactivateEmailIntegration = mutation({
  args: {
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    const integrations = await ctx.db
      .query("email_integrations")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider.trim().toLowerCase()))
      .collect();
    const now = Date.now();
    await Promise.all(
      integrations.map((integration) =>
        ctx.db.patch(integration._id, {
          active: false,
          updatedAt: now,
        }),
      ),
    );
    return integrations.length;
  },
});

export const recordInboxSignal = mutation({
  args: {
    providerMessageId: v.string(),
    threadId: v.optional(v.string()),
    subject: v.string(),
    sender: v.string(),
    senderDomain: v.string(),
    snippet: v.string(),
    classification: v.string(),
    confidence: v.number(),
    applicationId: v.optional(v.id("applications")),
    receivedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = (
      await ctx.db
        .query("inbox_signals")
        .withIndex("by_message", (q) => q.eq("providerMessageId", args.providerMessageId))
        .collect()
    )[0] ?? null;

    const payload = {
      providerMessageId: args.providerMessageId,
      threadId: args.threadId,
      subject: args.subject,
      sender: args.sender,
      senderDomain: args.senderDomain,
      snippet: args.snippet,
      classification: args.classification,
      confidence: args.confidence,
      applicationId: args.applicationId,
      receivedAt: args.receivedAt,
      createdAt: existing?.createdAt ?? now,
    };

    const signalId = existing
      ? (await ctx.db.patch(existing._id, payload), existing._id)
      : await ctx.db.insert("inbox_signals", payload);

    if (args.applicationId && args.classification !== "other") {
      const application = await ctx.db.get(args.applicationId);
      if (application) {
        const nextStatusByClassification: Record<string, string> = {
          reject: "reject",
          interview: "interview",
          request_info: "request_info",
          offer: "offer",
        };
        const nextStatus = nextStatusByClassification[args.classification];
        if (nextStatus) {
          await ctx.db.patch(args.applicationId, {
            status: nextStatus,
            updatedAt: now,
          });
        }
      }
    }

    return signalId;
  },
});

export const recordOptimizationSnapshot = mutation({
  args: {
    periodStart: v.number(),
    periodEnd: v.number(),
    sampleSize: v.number(),
    summaryJson: v.string(),
    recommendedConfigJson: v.string(),
    approved: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = (
      await ctx.db
        .query("optimization_snapshots")
        .withIndex("by_period", (q) => q.eq("periodStart", args.periodStart).eq("periodEnd", args.periodEnd))
        .collect()
    )[0] ?? null;

    const payload = {
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      sampleSize: args.sampleSize,
      summaryJson: args.summaryJson,
      recommendedConfigJson: args.recommendedConfigJson,
      approved: args.approved,
      approvedAt: existing?.approvedAt,
      createdAt: existing?.createdAt ?? Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return ctx.db.insert("optimization_snapshots", payload);
  },
});

export const setOptimizationApproval = mutation({
  args: {
    id: v.id("optimization_snapshots"),
    approved: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      approved: args.approved,
      approvedAt: args.approved ? Date.now() : undefined,
    });
    return args.id;
  },
});
