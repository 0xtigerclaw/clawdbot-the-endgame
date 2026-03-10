"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

type TweetItem = {
    id: string;
    text: string;
    createdAt?: string;
    url: string;
};

type UserLookupResponse = {
    data?: {
        id?: string;
    };
};

type TweetsResponse = {
    data?: Array<{
        id: string;
        text: string;
        created_at?: string;
    }>;
};

function normalizeUsername(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // If a URL, extract /<username>
    try {
        const url = new URL(trimmed);
        if (url.hostname === "x.com" || url.hostname === "twitter.com" || url.hostname.endsWith(".x.com")) {
            const seg = url.pathname.split("/").filter(Boolean)[0];
            if (!seg) return null;
            if (seg.toLowerCase() === "home") return null;
            if (seg.toLowerCase() === "i") return null;
            return seg.replace(/^@/, "");
        }
    } catch {
        // not a URL
    }

    return trimmed.replace(/^@/, "");
}

async function fetchJson(url: string, bearerToken: string): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
        const res = await fetch(url, {
            method: "GET",
            redirect: "follow",
            signal: controller.signal,
            headers: {
                authorization: `Bearer ${bearerToken}`,
                "user-agent": "Mozilla/5.0 (compatible; ClawdScout/1.0)",
            },
        });
        const text = await res.text();
        if (!res.ok) throw new Error(`X API error ${res.status}: ${text.slice(0, 200)}`);
        return JSON.parse(text) as unknown;
    } finally {
        clearTimeout(timeout);
    }
}

export const fetchUserTweets = action({
    args: { usernameOrUrl: v.string(), sourceId: v.optional(v.id("x_sources")) },
    handler: async (ctx, args) => {
        const username = normalizeUsername(args.usernameOrUrl);
        if (!username) return { error: "Could not parse an X username from the provided input." };

        const bearer = process.env.X_BEARER_TOKEN;
        if (!bearer) {
            const msg = "Missing X_BEARER_TOKEN environment variable (required to fetch X posts).";
            if (args.sourceId) {
                await ctx.runMutation(api.x.recordFailure, { id: args.sourceId, attemptedAt: Date.now(), error: msg });
            }
            return { error: msg };
        }

        try {
            const userLookup = await fetchJson(
                `https://api.twitter.com/2/users/by/username/${encodeURIComponent(username)}`,
                bearer
            ) as UserLookupResponse;
            const userId = userLookup.data?.id;
            if (!userId) throw new Error("X API: could not resolve user id.");

            const tweetsResp = await fetchJson(
                `https://api.twitter.com/2/users/${encodeURIComponent(userId)}/tweets?max_results=5&exclude=replies,retweets&tweet.fields=created_at`,
                bearer
            ) as TweetsResponse;

            const data = tweetsResp.data ?? [];
            const items: TweetItem[] = data.slice(0, 5).map((t) => ({
                id: t.id,
                text: (t.text ?? "").replace(/\s+/g, " ").trim(),
                createdAt: t.created_at,
                url: `https://x.com/${username}/status/${t.id}`,
            }));

            if (args.sourceId) {
                await ctx.runMutation(api.x.updateLastFetchedAt, { id: args.sourceId, lastFetchedAt: Date.now() });
            }

            return { username, items };
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            if (args.sourceId) {
                await ctx.runMutation(api.x.recordFailure, { id: args.sourceId, attemptedAt: Date.now(), error: message });
            }
            return { error: message };
        }
    },
});

export const addXSource = action({
    args: {
        name: v.string(),
        usernameOrUrl: v.string(),
        category: v.string(),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{ id: Id<"x_sources">; username: string }> => {
        const username = normalizeUsername(args.usernameOrUrl);
        if (!username) throw new Error("Could not parse an X username from that URL/handle.");

        // Add immediately; token may be missing, but we still allow saving the source.
        const id: Id<"x_sources"> = await ctx.runMutation(api.x.add, {
            name: args.name,
            username,
            category: args.category,
        });

        return { id, username };
    },
});
