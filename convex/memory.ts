import { action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import OpenAI from "openai";

// Lazy-load OpenAI client (Convex analyzes modules before env vars are available)
function getOpenAI() {
    return new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
}

// Internal mutation to store the vector
export const insertMemory = internalMutation({
    args: {
        agentName: v.string(),
        taskId: v.id("tasks"),
        content: v.string(),
        embedding: v.array(v.number()),
        tags: v.optional(v.array(v.string())),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("memories", {
            agentName: args.agentName,
            taskId: args.taskId,
            content: args.content,
            embedding: args.embedding,
            tags: args.tags,
            timestamp: Date.now(),
        });
    },
});

// Action: Generate Embedding and Store
export const storeMemory = action({
    args: {
        agentName: v.string(),
        taskId: v.id("tasks"),
        content: v.string(),
        tags: v.optional(v.array(v.string())),
    },
    handler: async (ctx, args) => {
        console.log(`[MEMORY] Embedding content for ${args.agentName}...`);

        try {
            const embeddingResponse = await getOpenAI().embeddings.create({
                model: "text-embedding-3-small",
                input: args.content,
            });

            const embedding = embeddingResponse.data[0].embedding;

            await ctx.runMutation(internal.memory.insertMemory, {
                agentName: args.agentName,
                taskId: args.taskId,
                content: args.content,
                embedding: embedding,
                tags: args.tags,
            });
            console.log(`[MEMORY] Successfully stored memory for task ${args.taskId}`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[MEMORY] Failed to generate embedding: ${message}`);
        }
    },
});

// Action: Search Memories
export const searchMemories = action({
    args: {
        query: v.string(),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        console.log(`[MEMORY] Searching for: "${args.query}"...`);

        try {
            const embeddingResponse = await getOpenAI().embeddings.create({
                model: "text-embedding-3-small",
                input: args.query,
            });
            const targetEmbedding = embeddingResponse.data[0].embedding;

            // Perform vector search
            const results = await ctx.vectorSearch("memories", "by_embedding", {
                vector: targetEmbedding,
                limit: args.limit || 3,
            });

            if (results.length === 0) return [];

            const memories = await ctx.runQuery(internal.memory.getMemoriesByIds, {
                ids: results.map(r => r._id),
            }) as Array<Record<string, unknown>>;

            return memories.map((m, i) => ({
                ...m,
                score: results[i]._score
            }));

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[MEMORY] Search failed: ${message}`);
            return [];
        }
    },
});

// Internal Query to batch fetch memories
export const getMemoriesByIds = internalQuery({
    args: { ids: v.array(v.id("memories")) },
    handler: async (ctx, args) => {
        const docs = [];
        for (const id of args.ids) {
            const doc = await ctx.db.get(id);
            if (doc) docs.push(doc);
        }
        return docs;
    },
});
