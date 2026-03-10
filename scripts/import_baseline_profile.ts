import fs from "node:fs";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { PDFParse } from "pdf-parse";
import * as worker from "pdf-parse/worker";
import { api } from "../convex/_generated/api";
import {
  BASELINE_DISPLAY_NAME,
  BASELINE_CV_FILES,
  EVIDENCE_PRIORITY_TERMS,
  BASELINE_LOCATIONS,
  BASELINE_ROLE_TRACK,
  BASELINE_WORK_MODES,
  GITHUB_PROFILE_USERNAME,
  GITHUB_REPOS_FOR_EVIDENCE,
  SUPPLEMENTAL_EVIDENCE_FILES,
  SUPPLEMENTAL_EVIDENCE_URLS,
} from "../lib/candidateBaseline";
import { deriveJobScores, extractKeywords, type CandidateProfileForScoring } from "../lib/jobSearch";

type ImportProfileResult = {
  ok: boolean;
  error?: string;
  profileId?: string;
  importedFiles?: string[];
  keywordCount?: number;
  evidenceCount?: number;
  sourceCount?: number;
  rescoredJobs?: number;
};

type ParsedSource = {
  sourceFile: string;
  text: string;
};

const NOISY_IMPORT_KEYWORDS = new Set([
  "###",
  "added",
  "create",
  "created",
  "daily",
  "default",
  "file",
  "files",
  "latest",
  "ledger",
  "local",
  "mode",
  "modes",
  "notes",
  "project",
  "projects",
  "readme",
  "recent",
  "run",
  "script",
  "scripts",
  "source",
  "sources",
  "status",
  "sync",
  "task",
  "tasks",
  "today",
  "updated",
]);

function getConvexClient(): ConvexHttpClient {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is required.");
  }
  return new ConvexHttpClient(convexUrl);
}

function cleanText(input: string): string {
  return input
    .replace(/\r/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&ndash;/gi, "-")
    .replace(/&mdash;/gi, "-")
    .replace(/&middot;/gi, " ")
    .replace(/&hellip;/gi, "...")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/");
}

function htmlToText(input: string): string {
  const normalized = input
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "\n")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|aside|header|footer|main|nav|ul|ol|li|h1|h2|h3|h4|h5|h6|summary|details|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ");

  return cleanText(decodeHtmlEntities(normalized));
}

function scoreEvidenceLine(line: string): number {
  const normalized = line.toLowerCase();
  const keywordHits = EVIDENCE_PRIORITY_TERMS.reduce(
    (total, term) => total + (normalized.includes(term) ? 1 : 0),
    0,
  );
  const lengthScore = Math.min(line.length, 220) / 220;
  return keywordHits * 4 + lengthScore;
}

function shouldKeepEvidenceLine(line: string): boolean {
  const normalized = line.toLowerCase();
  const blockedPatterns = [
    "/users/",
    "/cdn-cgi/",
    ".env.local",
    ".next/",
    "agenda",
    "back to homepage",
    "book now",
    "billing entity",
    "privacy policy",
    "refund policy",
    "terms and conditions",
    "git status",
    "linkedin",
    "registered address",
    "website",
    "working tree is currently dirty",
    "http://127.0.0.1",
    "localhost",
    "max create limit per run",
    "run lock file",
  ];

  return !blockedPatterns.some((pattern) => normalized.includes(pattern));
}

function chunkEvidence(text: string, sourceFile: string, limit = 8): Array<{ sourceFile: string; excerpt: string }> {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^[\-•*\u2022]+\s*/, "").trim())
    .filter((line) => line.length >= 45 && line.length <= 320)
    .filter((line) => shouldKeepEvidenceLine(line));

  const seen = new Set<string>();
  const excerpts: Array<{ sourceFile: string; excerpt: string }> = [];
  const ranked = [...lines].sort((left, right) => scoreEvidenceLine(right) - scoreEvidenceLine(left));
  for (const line of ranked) {
    const normalized = line.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    excerpts.push({ sourceFile, excerpt: line });
    if (excerpts.length >= limit) break;
  }
  return excerpts;
}

function buildSummary(keywords: string[]): string {
  const leadingKeywords = keywords.slice(0, 12).join(", ");
  return `Applied AI and solutions architecture profile spanning enterprise tooling, agent orchestration, workflow design, privacy-aware systems, and developer enablement. Evidence is derived from the local CV set plus supplemental portfolio material and public GitHub activity. Core signals: ${leadingKeywords}.`;
}

function buildCandidateKeywords(input: {
  cvTexts: string[];
  evidenceExcerpts: Array<{ sourceFile: string; excerpt: string }>;
}): string[] {
  const keywordText = [
    ...input.cvTexts,
    ...input.evidenceExcerpts.map((item) => item.excerpt),
  ].join("\n");

  const extracted = extractKeywords(keywordText, 120).filter((token) => !NOISY_IMPORT_KEYWORDS.has(token));
  const priority = EVIDENCE_PRIORITY_TERMS.filter((term) => keywordText.toLowerCase().includes(term));

  return Array.from(
    new Set(
      [
        ...priority,
        ...extracted,
        "ai",
        "applied",
        "architecture",
        "codex",
        "deployment",
        "enterprise",
        "federated",
        "openclaw",
        "orchestration",
        "solutions",
        "tooling",
      ].filter((token) => !NOISY_IMPORT_KEYWORDS.has(token)),
    ),
  ).slice(0, 48);
}

function dedupeByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function parsePdf(filePath: string): Promise<string> {
  PDFParse.setWorker(worker.getPath());
  const data = fs.readFileSync(filePath);
  const parser = new PDFParse({ data });
  try {
    const parsed = await parser.getText();
    return cleanText(parsed?.text || "");
  } finally {
    await parser.destroy();
  }
}

function readTextFile(filePath: string): ParsedSource {
  return {
    sourceFile: filePath,
    text: cleanText(fs.readFileSync(filePath, "utf8")),
  };
}

async function fetchGitHubProfile(username: string): Promise<ParsedSource | null> {
  const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "mission-control-profile-import",
    },
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as {
    html_url?: string;
    name?: string | null;
    login?: string;
    bio?: string | null;
    location?: string | null;
    blog?: string | null;
  };

  const profileText = [
    payload.name || payload.login || username,
    payload.bio || "",
    payload.location ? `Location: ${payload.location}` : "",
    payload.blog ? `Website: ${payload.blog}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (!profileText.trim()) return null;
  return {
    sourceFile: payload.html_url || `https://github.com/${username}`,
    text: cleanText(profileText),
  };
}

async function fetchGitHubRepoEvidence(username: string, repo: string): Promise<ParsedSource[]> {
  const repoResponse = await fetch(`https://api.github.com/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo)}`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "mission-control-profile-import",
    },
  });
  if (!repoResponse.ok) return [];

  const repoPayload = (await repoResponse.json()) as {
    html_url?: string;
    name?: string;
    description?: string | null;
    language?: string | null;
    homepage?: string | null;
    topics?: string[];
    updated_at?: string;
  };

  const sources: ParsedSource[] = [];
  const repoSummaryText = [
    repoPayload.name || repo,
    repoPayload.description || "",
    repoPayload.language ? `Primary language: ${repoPayload.language}` : "",
    repoPayload.updated_at ? `Updated at: ${repoPayload.updated_at}` : "",
    repoPayload.homepage ? `Homepage: ${repoPayload.homepage}` : "",
    Array.isArray(repoPayload.topics) && repoPayload.topics.length > 0 ? `Topics: ${repoPayload.topics.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (repoSummaryText.trim()) {
    sources.push({
      sourceFile: repoPayload.html_url || `https://github.com/${username}/${repo}`,
      text: cleanText(repoSummaryText),
    });
  }

  const readmeResponse = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo)}/readme`,
    {
      headers: {
        accept: "application/vnd.github.raw+json",
        "user-agent": "mission-control-profile-import",
      },
    },
  );
  if (readmeResponse.ok) {
    const readme = cleanText(await readmeResponse.text());
    if (readme) {
      sources.push({
        sourceFile: `${repoPayload.html_url || `https://github.com/${username}/${repo}`}#readme`,
        text: readme,
      });
    }
  }

  return sources;
}

async function fetchWebEvidence(url: string): Promise<ParsedSource | null> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "mission-control-profile-import",
    },
  });
  if (!response.ok) return null;

  const html = await response.text();
  const text = htmlToText(html);
  if (!text) return null;

  return {
    sourceFile: url,
    text,
  };
}

async function loadSupplementalSources(): Promise<ParsedSource[]> {
  const webSources: ParsedSource[] = [];
  try {
    for (const url of SUPPLEMENTAL_EVIDENCE_URLS) {
      const source = await fetchWebEvidence(url);
      if (source) webSources.push(source);
    }
  } catch {
    // Public website evidence is best-effort; other sources still import cleanly.
  }

  const localSources = SUPPLEMENTAL_EVIDENCE_FILES
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => readTextFile(filePath));

  const githubSources: ParsedSource[] = [];
  try {
    if (GITHUB_PROFILE_USERNAME) {
      const profile = await fetchGitHubProfile(GITHUB_PROFILE_USERNAME);
      if (profile) githubSources.push(profile);
    }

    for (const repo of GITHUB_REPOS_FOR_EVIDENCE) {
      githubSources.push(...(await fetchGitHubRepoEvidence(GITHUB_PROFILE_USERNAME, repo)));
    }
  } catch {
    // GitHub enrichment is best-effort; local evidence still imports cleanly.
  }

  return [...webSources, ...localSources, ...githubSources];
}

async function rescoreExistingJobs(
  client: ConvexHttpClient,
  candidate: CandidateProfileForScoring,
): Promise<number> {
  const jobs = await client.query(api.hiring.listJobPosts, {
    status: "all",
    limit: 5000,
  });

  for (const job of jobs) {
    const score = deriveJobScores({
      company: job.company,
      title: job.title,
      location: job.location,
      remoteType: job.remoteType,
      description: job.description,
      candidate,
    });

    await client.mutation(api.hiring.upsertJobPost, {
      sourceId: job.sourceId,
      externalJobId: job.externalJobId,
      company: job.company,
      title: job.title,
      location: job.location,
      remoteType: job.remoteType,
      employmentType: job.employmentType,
      url: job.url,
      description: job.description,
      keywords: job.keywords,
      fitScore: score.fitScore,
      atsScore: score.atsScore,
      status: score.status,
      scoreReason: score.scoreReason,
      matchedKeywords: score.matchedKeywords,
      lastSyncedAt: job.lastSyncedAt ?? Date.now(),
    });
  }

  return jobs.length;
}

async function main(): Promise<ImportProfileResult> {
  const client = getConvexClient();
  const missingFiles = BASELINE_CV_FILES.filter((filePath) => !fs.existsSync(filePath));
  if (missingFiles.length > 0) {
    return {
      ok: false,
      error: `Missing baseline CV files: ${missingFiles.join(", ")}. Add your PDFs to data/candidate-profile/ and review data/candidate-profile/README.md.`,
    };
  }

  const parsedFiles = await Promise.all(
    BASELINE_CV_FILES.map(async (filePath) => {
      const text = await parsePdf(filePath);
      return {
        filePath,
        text,
        fileName: path.basename(filePath),
      };
    }),
  );

  const supplementalSources = await loadSupplementalSources();
  const aggregatedText = [
    ...parsedFiles.map((file) => `# ${file.fileName}\n\n${file.text}`),
    ...supplementalSources.map((source) => `# ${source.sourceFile}\n\n${source.text}`),
  ].join("\n\n");
  const evidenceExcerpts = dedupeByKey(
    [
      ...parsedFiles.flatMap((file) => chunkEvidence(file.text, file.filePath, 4)),
      ...supplementalSources.flatMap((source) => chunkEvidence(source.text, source.sourceFile, 3)),
    ],
    (item) => `${item.sourceFile}::${item.excerpt.toLowerCase()}`,
  )
    .sort((left, right) => scoreEvidenceLine(right.excerpt) - scoreEvidenceLine(left.excerpt))
    .slice(0, 36);
  const keywords = buildCandidateKeywords({
    cvTexts: parsedFiles.map((file) => file.text),
    evidenceExcerpts,
  });
  const importedFiles = dedupeByKey([
    ...parsedFiles.map((file) => file.filePath),
    ...supplementalSources.map((source) => source.sourceFile),
  ], (item) => item);
  const candidateProfile: CandidateProfileForScoring = {
    roleTrack: BASELINE_ROLE_TRACK,
    keywords,
    preferredLocations: [...BASELINE_LOCATIONS],
    workModes: [...BASELINE_WORK_MODES],
    exactMatchGlobal: true,
    evidenceExcerpts,
  };

  const profileId = await client.mutation(api.hiring.upsertCandidateProfile, {
    displayName: BASELINE_DISPLAY_NAME,
    roleTrack: BASELINE_ROLE_TRACK,
    summary: buildSummary(keywords),
    aggregatedText,
    keywords,
    sourceFiles: importedFiles,
    evidenceExcerpts,
    preferredLocations: [...BASELINE_LOCATIONS],
    workModes: [...BASELINE_WORK_MODES],
    exactMatchGlobal: true,
    active: true,
  });
  const rescoredJobs = await rescoreExistingJobs(client, candidateProfile);

  return {
    ok: true,
    profileId,
    importedFiles,
    keywordCount: keywords.length,
    evidenceCount: evidenceExcerpts.length,
    sourceCount: importedFiles.length,
    rescoredJobs,
  };
}

main()
  .then((payload) => {
    console.log(JSON.stringify(payload));
    process.exit(payload.ok ? 0 : 1);
  })
  .catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies ImportProfileResult),
    );
    process.exit(1);
  });
