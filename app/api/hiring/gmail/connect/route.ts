import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

function getAppOrigin(request: Request): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || new URL(request.url).origin).replace(/\/$/, "");
}

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(`${getAppOrigin(request)}/setup/email?error=missing_google_client_id`);
  }

  const state = crypto.randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("mission_control_gmail_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: getAppOrigin(request).startsWith("https://"),
    maxAge: 10 * 60,
    path: "/",
  });

  const redirectUri = `${getAppOrigin(request)}/api/hiring/gmail/callback`;
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/gmail.readonly");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl);
}
