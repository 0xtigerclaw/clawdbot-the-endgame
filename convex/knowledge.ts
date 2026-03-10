import { action, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

// Document ingestion with Voyage AI embeddings
export const ingestDocument = action({
    args: {
        documentName: v.string(),
        sections: v.array(
            v.object({
                section: v.string(), // "Mission", "Problem", "Team_Background"
                content: v.string(), // The text chunk
            })
        ),
        metadata: v.object({
            source: v.string(), // "pitch_deck", "cv", "technical_paper"
            version: v.optional(v.string()),
            audienceTags: v.optional(v.array(v.string())),
        }),
    },
    handler: async (ctx, args) => {
        const chunks = [];

        for (let i = 0; i < args.sections.length; i++) {
            const { section, content } = args.sections[i];

            console.log(`[ingestDocument] Processing section ${i + 1}/${args.sections.length}: ${section}`);

            // Generate embedding using Voyage AI
            const embeddingResponse = await fetch(
                "https://api.voyageai.com/v1/embeddings",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
                    },
                    body: JSON.stringify({
                        model: "voyage-2",
                        input: [`${section}: ${content}`],
                    }),
                }
            );

            const embeddingData = await embeddingResponse.json();

            if (!embeddingData.data || !embeddingData.data[0]) {
                throw new Error(`Voyage AI embedding failed: ${JSON.stringify(embeddingData)}`);
            }

            const embedding = embeddingData.data[0].embedding;

            // Store in company_knowledge table
            await ctx.runMutation(api.knowledge.storeChunk, {
                documentName: args.documentName,
                section,
                content,
                embedding,
                metadata: args.metadata,
            });

            chunks.push({ section, chars: content.length });
        }

        return { success: true, chunksStored: chunks.length, chunks };
    },
});

// Quick helper to ingest "Sample Application" PDF
export const ingestSoraChainQuick = action({
    args: {},
    handler: async (ctx) => {
        const sections = [
            {
                section: "Founder Bio - Example Founder",
                content: "Example Founder (CEO) - operator with deep experience in platform strategy, distributed systems, and developer ecosystems. Background spans technical research, product design, and go-to-market collaboration for emerging infrastructure products."
            },
            {
                section: "Co-Founder Bio - Example CTO",
                content: "Example CTO - systems engineer focused on AI infrastructure, orchestration, and performance-sensitive workloads. Experienced in computer vision, production pipelines, and large-scale developer tooling."
            },
            {
                section: "Target Market",
                content: "B2C/Retail: Permissionless subnets for personal intelligence on smartphones. B2B: Healthcare, finance, robotics, life sciences. Enabling organizations to train across diverse datasets without breaching privacy/regulation. Value capture at inference layer."
            },
            {
                section: "Differentiation vs Competitors",
                content: "Flock (Bittensor) is application-level; SoraChain is infrastructure-level (base layer). Owkin/Apheris are Web2 centralized/permissioned; SoraChain is trustless/permissionless. NVIDIA FLARE/Flower are integration channels, not competitors; SoraChain adds the missing incentives/trust layer."
            },
            {
                section: "Monetization Strategy",
                content: "B2B: Inference Economy - Enterprises pay to access domain-specific models (e.g., biotech, finance) via API. B2C: Incentivized Personal Learning - Users earn rewards for local training contributions. Creates a self-sustaining loop of data, models, and compute."
            },
            {
                section: "Strategic Validation",
                content: "Invited by NVIDIA to present at NVFLARE Day 2025 as the only Web3-native project alongside SWIFT, Eli Lilly. Validated thesis that federated learning works technically but needs a trustless coordination layer. 3 pilot partners: Smartglasses (Open Source), Esports analytics, Biotech startup."
            },
            {
                section: "Why Now",
                content: "Modern AI faces 3 barriers: Data Locality (privacy laws prevent centralization), Data Diversity (bias in centralized datasets), and Trustless Scalability. SoraChain solves this by bringing models to the data trustlessly."
            },
            {
                section: "5 Year Vision",
                content: "One global cancer model trained on every demographic without moving data. 10+ domain-specific subnets. A trillion-dollar coordination economy where data, models, and compute form an integrated value loop."
            }
        ];

        console.log(`[ingestSoraChainQuick] Attempting to ingest ${sections.length} application chunks...`);

        let successCount = 0;

        for (let i = 0; i < sections.length; i++) {
            const section = sections[i];
            try {
                const metadata = {
                    source: "application_pdf",
                    version: "2025-02-10",
                    audienceTags: ["investor", "technical", "grant_committee"]
                };

                // Call ingestDocument directly
                await ctx.runAction(api.knowledge.ingestDocument, {
                    documentName: "SoraChain AI - YZi Application",
                    sections: [section],
                    metadata
                });

                console.log(`[ingestSoraChainQuick] ✅ Successfully ingested: ${section.section}`);
                successCount++;

                // Wait between chunks to respect rate limits
                if (i < sections.length - 1) {
                    console.log(`[ingestSoraChainQuick] ⏳ Waiting 30s before next chunk...`);
                    await new Promise(resolve => setTimeout(resolve, 30000));
                }

            } catch (error) {
                console.error(`[ingestSoraChainQuick] ❌ Failed to ingest ${section.section}:`, error);

                const errorMsg = error instanceof Error ? error.message : String(error);
                if (errorMsg.includes("rate limits")) {
                    console.log(`[ingestSoraChainQuick] ⏳ Rate limit hit. Waiting 60s cooldown...`);
                    await new Promise(resolve => setTimeout(resolve, 60000));
                }
            }
        }

        return {
            success: true,
            attempted: sections.length,
            ingested: successCount,
            message: `Ingested ${successCount}/${sections.length} application chunks`
        };
    }
});

export const deleteChunk = mutation({
    args: { id: v.id("company_knowledge") },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.id);
    },
});

export const storeChunk = mutation({
    args: {
        documentName: v.string(),
        section: v.string(),
        content: v.string(),
        embedding: v.array(v.float64()),
        metadata: v.object({
            source: v.string(),
            version: v.optional(v.string()),
            audienceTags: v.optional(v.array(v.string())),
        }),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("company_knowledge", {
            ...args,
            updatedAt: Date.now(),
        });
    },
});

// Query to get all knowledge chunks (for debugging)
export const getAllKnowledge = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("company_knowledge").collect();
    },
});

// Count knowledge chunks
export const getKnowledgeCount = query({
    args: {},
    handler: async (ctx) => {
        const all = await ctx.db.query("company_knowledge").collect();
        return { count: all.length };
    },
});

// Search knowledge base using vector similarity with Voyage AI
export const searchKnowledge = action({
    args: {
        query: v.string(),
        limit: v.optional(v.number()),
    },
    handler: async (
        ctx,
        args,
    ): Promise<Array<Doc<"company_knowledge"> & { _score: number }>> => {
        // Generate embedding for the query using Voyage AI
        const embeddingResponse = await fetch(
            "https://api.voyageai.com/v1/embeddings",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
                },
                body: JSON.stringify({
                    model: "voyage-2",
                    input: [args.query],
                }),
            }
        );

        const embeddingData = await embeddingResponse.json() as { data?: Array<{ embedding?: number[] }> };

        if (!embeddingData.data || !embeddingData.data[0]) {
            console.error('[searchKnowledge] Voyage AI error:', embeddingData);
            return [];
        }

        const queryEmbedding = embeddingData.data[0].embedding;
        if (!queryEmbedding) {
            console.error("[searchKnowledge] Missing embedding vector from Voyage response");
            return [];
        }

        // Vector search returns { _id, _score } only — need to hydrate
        const vectorResults = await ctx.vectorSearch("company_knowledge", "by_embedding", {
            vector: queryEmbedding,
            limit: args.limit || 5,
        });

        // Hydrate: fetch full documents and merge with scores
        const hydrated: Array<Doc<"company_knowledge"> & { _score: number }> = [];
        for (const result of vectorResults) {
            const doc: Doc<"company_knowledge"> | null = await ctx.runQuery(internal.knowledge.getChunkById, { id: result._id });
            if (doc) {
                hydrated.push({
                    ...doc,
                    _score: result._score,
                });
            }
        }

        return hydrated;
    },
});

// Internal query to hydrate a single knowledge chunk by ID
export const getChunkById = internalQuery({
    args: { id: v.id("company_knowledge") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
    },
});
