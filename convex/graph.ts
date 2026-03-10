import { action, internalMutation, internalQuery, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// Create or update a node with Voyage embeddings
export const upsertNode = action({
    args: {
        label: v.string(),
        type: v.string(),
        description: v.string(),
        metadata: v.optional(v.any()),
    },
    handler: async (ctx, args): Promise<Id<"graph_nodes">> => {
        // 1. Generate embedding using Voyage AI
        const embeddingResponse = await fetch("https://api.voyageai.com/v1/embeddings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
            },
            body: JSON.stringify({
                model: "voyage-2",
                input: [`${args.label} (${args.type}): ${args.description}`],
            }),
        });

        const embeddingData = await embeddingResponse.json() as { data?: Array<{ embedding?: number[] }> };
        if (!embeddingData.data?.[0]) {
            throw new Error(`Voyage AI error: ${JSON.stringify(embeddingData)}`);
        }
        const embedding = embeddingData.data[0].embedding;
        if (!embedding) {
            throw new Error("Voyage AI returned no embedding vector");
        }

        // 2. Store in database (Internal Mutation)
        const nodeId: Id<"graph_nodes"> = await ctx.runMutation(internal.graph.storeNodeInternal, {
            label: args.label,
            type: args.type,
            description: args.description,
            embedding,
            metadata: args.metadata,
        });

        return nodeId;
    },
});

export const storeNodeInternal = internalMutation({
    args: {
        label: v.string(),
        type: v.string(),
        description: v.string(),
        embedding: v.array(v.float64()),
        metadata: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("graph_nodes")
            .filter((q) => q.eq(q.field("label"), args.label))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                type: args.type,
                description: args.description,
                embedding: args.embedding,
                metadata: args.metadata,
                updatedAt: Date.now(),
            });
            return existing._id;
        }

        return await ctx.db.insert("graph_nodes", {
            ...args,
            updatedAt: Date.now(),
        });
    },
});

export const addEdge = mutation({
    args: {
        fromLabel: v.string(),
        toLabel: v.string(),
        relationship: v.string(),
        description: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const fromNode = await ctx.db
            .query("graph_nodes")
            .filter((q) => q.eq(q.field("label"), args.fromLabel))
            .first();
        const toNode = await ctx.db
            .query("graph_nodes")
            .filter((q) => q.eq(q.field("label"), args.toLabel))
            .first();

        if (!fromNode || !toNode) {
            throw new Error(`Nodes not found: ${args.fromLabel} or ${args.toLabel}`);
        }

        // Check if edge already exists
        const existing = await ctx.db
            .query("graph_edges")
            .withIndex("by_from", (q) => q.eq("fromId", fromNode._id))
            .filter((q) => q.eq(q.field("toId"), toNode._id))
            .filter((q) => q.eq(q.field("relationship"), args.relationship))
            .first();

        if (existing) return existing._id;

        return await ctx.db.insert("graph_edges", {
            fromId: fromNode._id,
            toId: toNode._id,
            relationship: args.relationship,
            description: args.description,
            updatedAt: Date.now(),
        });
    },
});

// Search nodes and their neighborhood
export const queryKnowledgeGraph = action({
    args: {
        query: v.string(),
        depth: v.optional(v.number()), // How many hops? Default 1.
    },
    handler: async (ctx, args): Promise<string> => {
        // 1. Query Expansion: Translate vague question into entity search terms
        // We use Gemini (fast/cheap) for this preprocessing step
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

        console.log(`[GraphRAG] Original Query: "${args.query}"`);

        const expansionPrompt = `
You are a GraphRAG retrieval assistant for SoraChain AI.
Convert the user's vague question into a list of 3-5 specific entities or concepts to search for in a knowledge graph.

USER QUESTION: "${args.query}"

Return ONLY a comma-separated list of search terms.
Example for "What are you working on?": SoraChain AI, Current Projects, Traction, Roadmap, Mission
`;

        const expansionResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: expansionPrompt }] }]
            }),
        });

        const expansionData = await expansionResponse.json() as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const expandedQuery = expansionData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || args.query;
        console.log(`[GraphRAG] Expanded Terms: ${expandedQuery}`);

        // 2. Embed the expanded terms (Voyage)
        const embeddingResponse = await fetch("https://api.voyageai.com/v1/embeddings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
            },
            body: JSON.stringify({
                model: "voyage-2",
                input: [expandedQuery], // Searching for the expanded context
            }),
        });
        const embeddingData = await embeddingResponse.json() as { data?: Array<{ embedding?: number[] }> };
        if (!embeddingData.data?.[0]?.embedding) {
            throw new Error("Voyage AI embedding failed for graph query");
        }
        const queryEmbedding = embeddingData.data[0].embedding;

        // 3. Initial vector search for root nodes
        const vectorResults = await ctx.vectorSearch("graph_nodes", "by_embedding", {
            vector: queryEmbedding,
            limit: 5, // Increased limit for better coverage
        });

        const contextStrings: string[] = [];
        const visitedNodes = new Set<string>();

        for (const res of vectorResults) {
            const rootNode = await ctx.runQuery(internal.graph.getNodeInternal, { id: res._id });
            if (!rootNode || visitedNodes.has(rootNode._id)) continue;

            visitedNodes.add(rootNode._id);
            let slice = `ENTITY: ${rootNode.label} (${rootNode.type})\nINFO: ${rootNode.description}\n`;

            // 3. One-hop expansion
            const edges = await ctx.runQuery(internal.graph.getEdgesForNode, { id: rootNode._id });
            if (edges.length > 0) {
                slice += "RELATIONSHIPS:\n";
                for (const edge of edges) {
                    const target = await ctx.runQuery(internal.graph.getNodeInternal, { id: edge.toId });
                    if (target) {
                        slice += `- [${edge.relationship}] -> ${target.label} (${target.type})\n  Details: ${edge.description || "N/A"}\n`;
                    }
                }
            }
            contextStrings.push(slice);
        }

        return contextStrings.join("\n---\n");
    },
});

export const getNodeInternal = internalQuery({
    args: { id: v.id("graph_nodes") },
    handler: async (ctx, args) => await ctx.db.get(args.id),
});

export const getEdgesForNode = internalQuery({
    args: { id: v.id("graph_nodes") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("graph_edges")
            .withIndex("by_from", (q) => q.eq("fromId", args.id))
            .collect();
    },
});
