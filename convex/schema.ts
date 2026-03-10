import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema(
  {
    agents: defineTable({
      name: v.string(),
      role: v.optional(v.string()),
      status: v.string(),
      lastActive: v.optional(v.number()),
      sessionId: v.optional(v.string()),
    }),

    activity: defineTable({
      agentName: v.string(),
      type: v.string(),
      content: v.string(),
      timestamp: v.number(),
    }),

    tasks: defineTable({
      title: v.string(),
      description: v.optional(v.string()),
      priority: v.optional(v.string()),
      status: v.string(),
      assignedTo: v.optional(v.union(v.string(), v.array(v.string()))),
      workflow: v.optional(v.array(v.union(v.string(), v.array(v.string())))),
      currentStep: v.optional(v.number()),
      output: v.optional(v.string()),
      outputs: v.optional(
        v.array(
          v.object({
            stepNumber: v.number(),
            title: v.string(),
            content: v.string(),
            agent: v.string(),
            createdAt: v.number(),
          }),
        ),
      ),
      feedback: v.optional(v.string()),
      overlayHookCandidates: v.optional(
        v.array(
          v.union(
            v.string(),
            v.object({
              id: v.optional(v.string()),
              text: v.string(),
              source: v.optional(v.string()),
            }),
          ),
        ),
      ),
      selectedOverlayHook: v.optional(v.string()),
      selectedOverlayHookId: v.optional(v.string()),
      selectedOverlayHookAt: v.optional(v.number()),
    }),

    messages: defineTable({
      taskId: v.id("tasks"),
      agentName: v.string(),
      content: v.string(),
      timestamp: v.number(),
    }),

    notifications: defineTable({
      agentName: v.string(),
      type: v.string(),
      content: v.string(),
      taskId: v.optional(v.id("tasks")),
      delivered: v.boolean(),
      createdAt: v.number(),
    }),

    skills: defineTable({
      name: v.string(),
      description: v.optional(v.string()),
      generatedMd: v.optional(v.string()),
      updatedAt: v.number(),
    }),

    resources: defineTable({
      skillId: v.id("skills"),
      type: v.string(),
      title: v.string(),
      storageId: v.optional(v.string()),
      url: v.optional(v.string()),
      textContent: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_skill", ["skillId"]),

    rss_sources: defineTable({
      name: v.string(),
      originalUrl: v.optional(v.string()),
      url: v.string(),
      resolvedUrl: v.optional(v.union(v.null(), v.string())),
      category: v.string(),
      active: v.boolean(),
      lastScrapedAt: v.optional(v.number()),
      lastAttemptedAt: v.optional(v.number()),
      errorCount: v.optional(v.number()),
      lastError: v.optional(v.union(v.null(), v.string())),
      lastErrorAt: v.optional(v.union(v.null(), v.number())),
    })
      .index("by_url", ["url"])
      .index("by_originalUrl", ["originalUrl"]),

    x_sources: defineTable({
      name: v.string(),
      username: v.string(),
      category: v.string(),
      active: v.boolean(),
      lastFetchedAt: v.optional(v.number()),
      lastAttemptedAt: v.optional(v.number()),
      errorCount: v.optional(v.number()),
      lastError: v.optional(v.union(v.null(), v.string())),
      lastErrorAt: v.optional(v.union(v.null(), v.number())),
    }),

    scouted_links: defineTable({
      url: v.string(),
      title: v.optional(v.string()),
      summary: v.optional(v.string()),
      agent: v.string(),
      taskId: v.optional(v.id("tasks")),
      tags: v.optional(v.array(v.string())),
      qualityScore: v.optional(v.number()),
      publishedAt: v.optional(v.number()),
      status: v.string(),
      feedback: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_url", ["url"])
      .index("by_task", ["taskId"])
      .index("by_status", ["status"]),

    memories: defineTable({
      agentName: v.string(),
      taskId: v.id("tasks"),
      content: v.string(),
      embedding: v.array(v.number()),
      tags: v.optional(v.array(v.string())),
      timestamp: v.number(),
    }).vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
    }),

    company_knowledge: defineTable({
      documentName: v.string(),
      section: v.string(),
      content: v.string(),
      embedding: v.array(v.number()),
      metadata: v.object({
        source: v.string(),
        version: v.optional(v.string()),
        audienceTags: v.optional(v.array(v.string())),
      }),
      updatedAt: v.number(),
    }).vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1024,
    }),

    graph_nodes: defineTable({
      label: v.string(),
      type: v.string(),
      description: v.string(),
      embedding: v.array(v.number()),
      metadata: v.optional(v.any()),
      updatedAt: v.number(),
    }).vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1024,
    }),

    graph_edges: defineTable({
      fromId: v.id("graph_nodes"),
      toId: v.id("graph_nodes"),
      relationship: v.string(),
      description: v.optional(v.string()),
      updatedAt: v.number(),
    }).index("by_from", ["fromId"]),

    system_status: defineTable({
      status: v.string(),
      updatedAt: v.number(),
    }),

    linkedin_post_analytics: defineTable({
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
      sourceFile: v.optional(v.string()),
      importCount: v.optional(v.number()),
      firstSeenAt: v.optional(v.number()),
      lastImportedAt: v.optional(v.number()),
      updatedAt: v.optional(v.number()),
      createdAt: v.optional(v.number()),
    }).index("by_activityUrn", ["activityUrn"]),

    candidate_profiles: defineTable({
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
      updatedAt: v.number(),
    }).index("by_active", ["active"]),

    job_sources: defineTable({
      name: v.string(),
      provider: v.string(),
      boardToken: v.string(),
      url: v.string(),
      active: v.boolean(),
      createdAt: v.number(),
      updatedAt: v.number(),
      lastFetchedAt: v.optional(v.number()),
      lastError: v.optional(v.union(v.null(), v.string())),
      lastErrorAt: v.optional(v.union(v.null(), v.number())),
    })
      .index("by_provider_token", ["provider", "boardToken"])
      .index("by_active", ["active"]),

    job_posts: defineTable({
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
      createdAt: v.number(),
      updatedAt: v.number(),
      lastSyncedAt: v.number(),
    })
      .index("by_source_external", ["sourceId", "externalJobId"])
      .index("by_status", ["status"])
      .index("by_updatedAt", ["updatedAt"]),

    resume_variants: defineTable({
      profileId: v.id("candidate_profiles"),
      jobPostId: v.id("job_posts"),
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
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_job_post", ["jobPostId"]),

    applications: defineTable({
      jobPostId: v.id("job_posts"),
      resumeVariantId: v.id("resume_variants"),
      coverLetter: v.string(),
      screeningAnswers: v.string(),
      status: v.string(),
      notes: v.optional(v.string()),
      approvalNotes: v.optional(v.string()),
      submittedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_job_post", ["jobPostId"])
      .index("by_status", ["status"]),

    email_integrations: defineTable({
      provider: v.string(),
      accountEmail: v.string(),
      tokenCiphertext: v.string(),
      refreshCiphertext: v.optional(v.string()),
      expiresAt: v.optional(v.number()),
      scopes: v.array(v.string()),
      active: v.boolean(),
      lastPolledAt: v.optional(v.number()),
      updatedAt: v.number(),
    }).index("by_provider", ["provider"]),

    inbox_signals: defineTable({
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
      createdAt: v.number(),
    })
      .index("by_message", ["providerMessageId"])
      .index("by_application", ["applicationId"])
      .index("by_receivedAt", ["receivedAt"]),

    optimization_snapshots: defineTable({
      periodStart: v.number(),
      periodEnd: v.number(),
      sampleSize: v.number(),
      summaryJson: v.string(),
      recommendedConfigJson: v.string(),
      approved: v.boolean(),
      approvedAt: v.optional(v.number()),
      createdAt: v.number(),
    }).index("by_period", ["periodStart", "periodEnd"]),
  },
  {
    schemaValidation: false,
  },
);
