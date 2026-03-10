const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "with",
  "you",
  "your",
  "will",
  "we",
  "our",
  "us",
  "they",
  "them",
  "have",
  "has",
  "had",
  "can",
  "should",
  "must",
  "not",
  "who",
  "what",
  "when",
  "where",
  "which",
]);

const EEA_REGIONS = [
  "austria",
  "belgium",
  "bulgaria",
  "croatia",
  "cyprus",
  "czech republic",
  "czechia",
  "denmark",
  "estonia",
  "finland",
  "france",
  "germany",
  "greece",
  "hungary",
  "iceland",
  "ireland",
  "italy",
  "latvia",
  "liechtenstein",
  "lithuania",
  "luxembourg",
  "malta",
  "netherlands",
  "norway",
  "poland",
  "portugal",
  "romania",
  "slovakia",
  "slovenia",
  "spain",
  "sweden",
];

export type CandidateEvidence = {
  sourceFile: string;
  excerpt: string;
};

export type CandidateProfileForScoring = {
  roleTrack: string;
  keywords: string[];
  preferredLocations: string[];
  workModes: string[];
  exactMatchGlobal: boolean;
  evidenceExcerpts: CandidateEvidence[];
};

export type JobScoreResult = {
  fitScore: number;
  atsScore: number;
  matchedKeywords: string[];
  evidenceMatches: CandidateEvidence[];
  status: "new" | "shortlisted" | "watchlist" | "rejected";
  scoreReason: string;
};

export function normalizeText(input: string): string {
  return (input || "")
    .toLowerCase()
    .replace(/[^a-z0-9+.#/\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripHtml(input: string): string {
  return (input || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(input: string): string[] {
  return normalizeText(input)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

export function extractKeywords(input: string, limit = 40): string[] {
  const counts = new Map<string, number>();
  for (const token of tokenize(input)) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([token]) => token);
}

function scoreOverlap(left: string[], right: string[]): {
  score: number;
  matches: string[];
} {
  if (left.length === 0 || right.length === 0) {
    return { score: 0, matches: [] };
  }

  const rightSet = new Set(right);
  const matches = left.filter((token) => rightSet.has(token));
  return {
    score: matches.length / Math.max(left.length, 1),
    matches,
  };
}

function scoreTitleSimilarity(jobTitle: string, roleTrack: string): number {
  const jobTokens = extractKeywords(jobTitle, 12);
  const roleTokens = extractKeywords(roleTrack, 12);
  return scoreOverlap(roleTokens, jobTokens).score;
}

function scoreLocationMatch(
  location: string,
  remoteType: string,
  preferredLocations: string[],
  workModes: string[],
  exactMatchGlobal: boolean,
  titleSimilarity: number,
  keywordCoverage: number,
): number {
  const normalizedLocation = normalizeText(location);
  const normalizedRemote = normalizeText(remoteType);
  const allowRemote = workModes.map((mode) => normalizeText(mode)).some((mode) => mode.includes("remote"));
  const wantsNetherlands = preferredLocations.map((entry) => normalizeText(entry)).includes("netherlands");
  const wantsEea = preferredLocations.map((entry) => normalizeText(entry)).includes("eea");

  if (allowRemote && (normalizedRemote.includes("remote") || normalizedLocation.includes("remote"))) {
    return 1;
  }

  if (wantsNetherlands && normalizedLocation.includes("netherlands")) {
    return 1;
  }

  if (wantsEea && EEA_REGIONS.some((region) => normalizedLocation.includes(region))) {
    return 0.92;
  }

  if (exactMatchGlobal && titleSimilarity >= 0.9 && keywordCoverage >= 0.8) {
    return 0.88;
  }

  return 0.25;
}

function scoreEvidenceDensity(matches: CandidateEvidence[]): number {
  if (matches.length >= 6) return 1;
  if (matches.length >= 4) return 0.88;
  if (matches.length >= 2) return 0.74;
  if (matches.length >= 1) return 0.62;
  return 0.4;
}

function pickEvidenceMatches(
  evidenceExcerpts: CandidateEvidence[],
  jobText: string,
  limit = 6,
): CandidateEvidence[] {
  const jobTokens = new Set(extractKeywords(jobText, 32));

  return evidenceExcerpts
    .map((entry) => ({
      entry,
      score: tokenize(entry.excerpt).reduce((total, token) => total + (jobTokens.has(token) ? 1 : 0), 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.entry);
}

function roundScore(score: number): number {
  return Math.round(score * 100) / 100;
}

export function deriveJobScores(input: {
  company: string;
  title: string;
  location: string;
  remoteType: string;
  description: string;
  candidate: CandidateProfileForScoring;
}): JobScoreResult {
  const candidateKeywords = input.candidate.keywords;
  const jobKeywordPool = extractKeywords(`${input.title} ${input.description}`, 32);
  const keywordCoverage = scoreOverlap(jobKeywordPool, candidateKeywords);
  const titleSimilarity = scoreTitleSimilarity(input.title, input.candidate.roleTrack);
  const evidenceMatches = pickEvidenceMatches(input.candidate.evidenceExcerpts, `${input.title} ${input.description}`);
  const locationMatch = scoreLocationMatch(
    input.location,
    input.remoteType,
    input.candidate.preferredLocations,
    input.candidate.workModes,
    input.candidate.exactMatchGlobal,
    titleSimilarity,
    keywordCoverage.score,
  );

  const fitScore = roundScore(
    0.45 * keywordCoverage.score +
      0.2 * titleSimilarity +
      0.15 * scoreEvidenceDensity(evidenceMatches) +
      0.1 * locationMatch +
      0.1 * (normalizeText(input.description).includes("architect") || normalizeText(input.description).includes("agent") ? 1 : 0.65),
  );

  const atsScore = roundScore(
    0.5 * keywordCoverage.score +
      0.2 * 0.92 +
      0.15 * scoreEvidenceDensity(evidenceMatches) +
      0.15 * (input.description.length > 1200 ? 0.88 : 0.74),
  );

  const shortlisted = fitScore >= 0.72 && atsScore >= 0.75;
  const normalizedJobText = normalizeText(`${input.title} ${input.description}`);
  const hasToolingRoleSignal = [
    "codex",
    "deployment",
    "solution",
    "architect",
    "enterprise",
    "workflow",
    "customer",
    "pre-sales",
  ].some((signal) => normalizedJobText.includes(signal));
  const hasCandidateToolingSignal = input.candidate.keywords.some((keyword) =>
    ["codex", "openclaw", "clawdbot", "orchestration", "workflow", "deployment", "enterprise"].includes(keyword),
  );
  const watchlist = !shortlisted && (
    (titleSimilarity >= 0.66 && locationMatch >= 0.88) ||
    (hasToolingRoleSignal && hasCandidateToolingSignal && keywordCoverage.score >= 0.12)
  );

  return {
    fitScore,
    atsScore,
    matchedKeywords: keywordCoverage.matches.slice(0, 12),
    evidenceMatches,
    status: shortlisted ? "shortlisted" : watchlist ? "watchlist" : "rejected",
    scoreReason: shortlisted
      ? `Shortlisted for ${input.candidate.roleTrack}. Keyword coverage ${Math.round(keywordCoverage.score * 100)}%, title similarity ${Math.round(titleSimilarity * 100)}%.`
      : watchlist
        ? `Watchlist match. Title similarity ${Math.round(titleSimilarity * 100)}%, keyword coverage ${Math.round(keywordCoverage.score * 100)}%, location score ${Math.round(locationMatch * 100)}%.`
      : `Rejected by fit gate. Keyword coverage ${Math.round(keywordCoverage.score * 100)}%, location score ${Math.round(locationMatch * 100)}%.`,
  };
}
