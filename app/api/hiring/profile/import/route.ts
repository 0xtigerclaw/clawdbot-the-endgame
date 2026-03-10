import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

type ImportProfileResult = {
  ok: boolean;
  error?: string;
  profileId?: string;
  importedFiles?: string[];
  keywordCount?: number;
  evidenceCount?: number;
  sourceCount?: number;
};

function parseScriptPayload(stdout: string, stderr: string): ImportProfileResult {
  const lines = `${stdout}\n${stderr}`
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const payload = lines[lines.length - 1];
  if (!payload) {
    throw new Error("Profile import script returned no output.");
  }
  return JSON.parse(payload) as ImportProfileResult;
}

export async function POST() {
  try {
    const tsxCliPath = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
    const scriptPath = path.join(process.cwd(), "scripts", "import_baseline_profile.ts");
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [tsxCliPath, scriptPath],
      {
        cwd: process.cwd(),
        env: process.env,
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    const payload = parseScriptPayload(stdout, stderr);
    if (!payload.ok) {
      return NextResponse.json(payload, { status: 500 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "stdout" in error &&
      "stderr" in error &&
      typeof error.stdout === "string" &&
      typeof error.stderr === "string"
    ) {
      try {
        const payload = parseScriptPayload(error.stdout, error.stderr);
        return NextResponse.json(payload, { status: 500 });
      } catch {
        // Fall through to generic error handling.
      }
    }
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
