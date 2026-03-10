import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

export const runtime = "nodejs";

function getConvexClient(): ConvexHttpClient {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is required.");
  }
  return new ConvexHttpClient(convexUrl);
}

export async function POST() {
  try {
    const client = getConvexClient();
    const count = await client.mutation(api.hiring.deactivateEmailIntegration, { provider: "gmail" });
    return NextResponse.json({ ok: true, deactivated: count });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
