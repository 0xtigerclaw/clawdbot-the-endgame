import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Utility to clear the knowledge base after schema changes
 */
export const clearKnowledgeBase = mutation({
    args: {},
    handler: async (ctx) => {
        const all = await ctx.db.query("company_knowledge").collect();
        for (const doc of all) {
            await ctx.db.delete(doc._id);
        }
        return { deleted: all.length };
    },
});

/**
 * Utility to clear GraphRAG tables before rebuilding from fresh corpus.
 */
export const clearKnowledgeGraph = mutation({
    args: {},
    handler: async (ctx) => {
        const edges = await ctx.db.query("graph_edges").collect();
        for (const edge of edges) {
            await ctx.db.delete(edge._id);
        }

        const nodes = await ctx.db.query("graph_nodes").collect();
        for (const node of nodes) {
            await ctx.db.delete(node._id);
        }

        return { deletedEdges: edges.length, deletedNodes: nodes.length };
    },
});
