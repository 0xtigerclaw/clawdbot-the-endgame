import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { encryptSecret } from "../../../../../lib/secretBox";

export const runtime = "nodejs";

function getAppOrigin(request: Request): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || new URL(request.url).origin).replace(/\/$/, "");
}

function getConvexClient(): ConvexHttpClient {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is required.");
  }
  return new ConvexHttpClient(convexUrl);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("mission_control_gmail_state")?.value;
  const baseRedirect = `${getAppOrigin(request)}/setup/email`;

  if (error) {
    return NextResponse.redirect(`${baseRedirect}?error=${encodeURIComponent(error)}`);
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(`${baseRedirect}?error=invalid_oauth_state`);
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("Google OAuth credentials are not configured.");
    }

    const redirectUri = `${getAppOrigin(request)}/api/hiring/gmail/callback`;
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      throw new Error(`Token exchange failed (${tokenResponse.status}): ${body}`);
    }

    const tokenPayload = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
    };

    const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: {
        authorization: `Bearer ${tokenPayload.access_token}`,
      },
    });
    if (!profileResponse.ok) {
      const body = await profileResponse.text();
      throw new Error(`Failed to read Gmail profile (${profileResponse.status}): ${body}`);
    }

    const profilePayload = (await profileResponse.json()) as { emailAddress: string };
    const convex = getConvexClient();
    const expiresAt = Date.now() + Math.max(tokenPayload.expires_in - 60, 60) * 1000;

    await convex.mutation(api.hiring.saveEmailIntegration, {
      provider: "gmail",
      accountEmail: profilePayload.emailAddress,
      tokenCiphertext: encryptSecret(tokenPayload.access_token),
      refreshCiphertext: tokenPayload.refresh_token
        ? encryptSecret(tokenPayload.refresh_token)
        : undefined,
      expiresAt,
      scopes: (tokenPayload.scope || "https://www.googleapis.com/auth/gmail.readonly").split(/\s+/).filter(Boolean),
      active: true,
    });

    cookieStore.delete("mission_control_gmail_state");
    return NextResponse.redirect(`${baseRedirect}?connected=1&account=${encodeURIComponent(profilePayload.emailAddress)}`);
  } catch (oauthError) {
    return NextResponse.redirect(
      `${baseRedirect}?error=${encodeURIComponent(oauthError instanceof Error ? oauthError.message : String(oauthError))}`,
    );
  }
}
