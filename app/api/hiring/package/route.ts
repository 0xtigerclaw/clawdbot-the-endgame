import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { deriveJobScores } from "../../../../lib/jobSearch";

export const runtime = "nodejs";

type OgilvyPackage = {
  resume_markdown?: string;
  resume_plain?: string;
  cover_letter?: string;
  screening_answers?: string[];
  ats_checklist?: string[];
  truth_audit?: Array<{ sourceFile: string; excerpt: string }>;
};

type CarnegieReview = {
  ats_risks?: string[];
  final_checklist?: string[];
  edits?: string[];
};

type PackageQuality = {
  score: number;
  reasons: string[];
  wordCount: number;
  headingCount: number;
  keywordHits: string[];
};

type NormalizedPackage = {
  resume_markdown: string;
  resume_plain: string;
  cover_letter: string;
  screening_answers: string[];
  ats_checklist: string[];
  truth_audit: Array<{ sourceFile: string; excerpt: string }>;
};

function getConvexClient(): ConvexHttpClient {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is required.");
  }
  return new ConvexHttpClient(convexUrl);
}

function extractBalancedJsonObject(input: string): string | null {
  const start = input.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < input.length; index += 1) {
    const char = input[index];
    if (!char) continue;

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return input.slice(start, index + 1);
    }
  }

  return null;
}

function parseJsonBlock<T>(input: string): T | null {
  const fenced = input.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidates = [
    fenced?.[1],
    input,
    extractBalancedJsonObject(input),
  ].filter((candidate): candidate is string => Boolean(candidate && candidate.trim()));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      continue;
    }
  }
  return null;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function stripMarkdown(input: string): string {
  return input
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .trim();
}

function parseTopLevelSections(input: string): Array<{ title: string; body: string }> {
  return input
    .split(/^#\s+/m)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const lines = chunk.split("\n");
      const title = (lines[0] ?? "").trim();
      const body = lines.slice(1).join("\n").trim();
      return { title, body };
    })
    .filter((section) => Boolean(section.title && section.body));
}

function extractPrimaryCvText(aggregatedText: string, sourceFiles: string[]): string {
  const sections = parseTopLevelSections(aggregatedText);
  if (sections.length === 0) return aggregatedText.trim();

  const preferredPdfNames = sourceFiles
    .map((sourceFile) => path.basename(sourceFile))
    .filter((name) => /\.pdf$/i.test(name));
  const firstPreferred = preferredPdfNames[0]?.toLowerCase() ?? "";

  if (firstPreferred) {
    const exact = sections.find((section) => section.title.toLowerCase() === firstPreferred);
    if (exact) return exact.body;

    const includes = sections.find((section) => section.title.toLowerCase().includes(firstPreferred));
    if (includes) return includes.body;
  }

  const anyPdfSection = sections.find((section) => /\.pdf$/i.test(section.title) || /\bcv\b/i.test(section.title));
  if (anyPdfSection) return anyPdfSection.body;

  return sections[0]?.body ?? aggregatedText.trim();
}

function extractCvDetailBullets(input: string, limit = 18): string[] {
  const lines = input
    .split(/\n+/)
    .map((line) => line.trim())
    .map((line) => line.replace(/^[\-•*]+\s*/, ""))
    .filter((line) => line.length >= 35 && line.length <= 240)
    .filter((line) => !/^(page|curriculum vitae|resume)$/i.test(line))
    .filter((line) => !/^https?:\/\//i.test(line));

  const ranked = lines.sort((left, right) => {
    const leftScore = Number(/\b(led|built|delivered|designed|architected|implemented|launched|managed)\b/i.test(left))
      + Number(/\b(20\d{2}|19\d{2}|years?)\b/i.test(left))
      + Math.min(left.length, 200) / 200;
    const rightScore = Number(/\b(led|built|delivered|designed|architected|implemented|launched|managed)\b/i.test(right))
      + Number(/\b(20\d{2}|19\d{2}|years?)\b/i.test(right))
      + Math.min(right.length, 200) / 200;
    return rightScore - leftScore;
  });

  return dedupeStrings(ranked).slice(0, limit).map((line) => `- ${line}`);
}

function sanitizeTruthAudit(
  input: unknown,
  fallback: Array<{ sourceFile: string; excerpt: string }>,
): Array<{ sourceFile: string; excerpt: string }> {
  if (!Array.isArray(input)) return fallback;
  const normalized = input
    .filter((entry): entry is { sourceFile: string; excerpt: string } => {
      return Boolean(
        entry &&
          typeof entry === "object" &&
          typeof (entry as { sourceFile?: unknown }).sourceFile === "string" &&
          typeof (entry as { excerpt?: unknown }).excerpt === "string",
      );
    })
    .map((entry) => ({
      sourceFile: entry.sourceFile,
      excerpt: entry.excerpt,
    }));
  return normalized.length > 0 ? normalized : fallback;
}

function countWords(input: string): number {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizePackage(parsed: OgilvyPackage, fallback: NormalizedPackage): NormalizedPackage {
  const resumeMarkdown = parsed.resume_markdown?.trim() || fallback.resume_markdown;
  return {
    resume_markdown: resumeMarkdown,
    resume_plain: parsed.resume_plain?.trim() || stripMarkdown(resumeMarkdown),
    cover_letter: parsed.cover_letter?.trim() || fallback.cover_letter,
    screening_answers: Array.isArray(parsed.screening_answers)
      ? parsed.screening_answers.filter((entry): entry is string => typeof entry === "string")
      : fallback.screening_answers,
    ats_checklist: Array.isArray(parsed.ats_checklist)
      ? parsed.ats_checklist.filter((entry): entry is string => typeof entry === "string")
      : fallback.ats_checklist,
    truth_audit: sanitizeTruthAudit(parsed.truth_audit, fallback.truth_audit ?? []),
  };
}

function evaluatePackageQuality(input: {
  packageData: OgilvyPackage;
  fallbackData: OgilvyPackage;
  jobTitle: string;
  company: string;
  matchedKeywords: string[];
}): PackageQuality {
  const resumeMarkdown = (input.packageData.resume_markdown ?? "").trim();
  const fallbackMarkdown = (input.fallbackData.resume_markdown ?? "").trim();
  const resumePlain = stripMarkdown(resumeMarkdown);
  const coverLetter = (input.packageData.cover_letter ?? "").trim();
  const headings = resumeMarkdown.match(/^#{1,6}\s+/gm) ?? [];
  const headingCount = headings.length;
  const wordCount = countWords(resumePlain);
  const lowerResume = resumePlain.toLowerCase();
  const keywordUniverse = dedupeStrings(input.matchedKeywords).slice(0, 24);
  const keywordHits = keywordUniverse.filter((keyword) => lowerResume.includes(keyword.toLowerCase()));
  const reasons: string[] = [];
  let score = 0;

  if (wordCount >= 600) score += 26;
  else if (wordCount >= 450) score += 20;
  else if (wordCount >= 320) score += 14;
  else reasons.push("resume_length_too_short");

  if (headingCount >= 6) score += 16;
  else if (headingCount >= 4) score += 12;
  else reasons.push("missing_structured_sections");

  if (keywordHits.length >= 8) score += 20;
  else if (keywordHits.length >= 5) score += 14;
  else if (keywordHits.length >= 3) score += 8;
  else reasons.push("insufficient_role_keyword_coverage");

  const titleMentioned = lowerResume.includes(input.jobTitle.toLowerCase());
  const companyMentioned = lowerResume.includes(input.company.toLowerCase());
  if (titleMentioned || companyMentioned) score += 8;
  else reasons.push("missing_role_or_company_alignment");

  const coverLetterWords = countWords(coverLetter);
  if (coverLetterWords >= 90 && coverLetterWords <= 260) score += 10;
  else reasons.push("cover_letter_length_out_of_range");

  const screeningCount = (input.packageData.screening_answers ?? []).length;
  if (screeningCount >= 3) score += 8;
  else if (screeningCount >= 2) score += 5;
  else reasons.push("missing_screening_answers_depth");

  const truthCount = (input.packageData.truth_audit ?? []).length;
  if (truthCount >= 4) score += 8;
  else if (truthCount >= 2) score += 5;
  else reasons.push("insufficient_truth_audit_evidence");

  if (resumeMarkdown.length + 120 >= fallbackMarkdown.length) score += 4;
  else reasons.push("shorter_than_baseline_fallback");

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
    wordCount,
    headingCount,
    keywordHits,
  };
}

function buildFallbackPackage(input: {
  displayName: string;
  roleTrack: string;
  summary: string;
  company: string;
  title: string;
  location: string;
  matchedKeywords: string[];
  evidence: Array<{ sourceFile: string; excerpt: string }>;
  primaryCvText: string;
}): NormalizedPackage {
  const evidenceBullets = input.evidence.slice(0, 8).map((entry) => `- ${entry.excerpt}`);
  const keywordBullets = dedupeStrings(input.matchedKeywords).slice(0, 18).map((keyword) => `- ${keyword}`);
  const baseCvBullets = extractCvDetailBullets(input.primaryCvText, 28);

  const resumeMarkdown = [
    `# ${input.displayName}`,
    `${input.roleTrack}`,
    "",
    `## Professional Summary`,
    input.summary,
    "",
    `## Target Role`,
    `${input.title} at ${input.company}`,
    `${input.location}`,
    "",
    `## Role-Relevant Skills`,
    ...(keywordBullets.length > 0 ? keywordBullets : ["- Tailored keywords will be pulled from the job description."]),
    "",
    `## Selected Experience Highlights`,
    ...(baseCvBullets.length > 0
      ? baseCvBullets
      : ["- Full baseline CV details were unavailable at generation time."]),
    "",
    `## Additional Role Evidence`,
    ...(evidenceBullets.length > 0 ? evidenceBullets : ["- Role-relevant evidence will be inserted from verified baseline CV records."]),
    "",
    `## ATS Alignment`,
    "- Standard section headings for ATS parsing",
    "- Keywords mirrored from the target job description",
    "- Claims restricted to verified baseline evidence",
  ].join("\n");

  const coverLetter = [
    `I am applying for the ${input.title} role at ${input.company}.`,
    `My background is strongest where solutions architecture, applied AI delivery, and cross-functional execution need to come together in production settings with measurable outcomes.`,
    `I have focused this version on the capabilities most relevant to this position, especially implementation quality, stakeholder alignment, and shipping complex AI-enabled systems responsibly.`,
    `The attached resume variant is tailored only from verified experience in the baseline CV set, and each major claim is anchored to explicit evidence rather than generic wording.`,
    `I would value the opportunity to discuss how this experience can directly support ${input.company}'s priorities for ${input.title}.`,
  ].join(" ");

  return {
    resume_markdown: resumeMarkdown,
    resume_plain: stripMarkdown(resumeMarkdown),
    cover_letter: coverLetter,
    screening_answers: [
      `I fit this role because my background already combines architecture, delivery, and AI-focused execution in factual prior work.`,
      `I am targeting roles in the Netherlands, broader EEA, and remote-first environments, with flexibility for exact-match opportunities globally.`,
      `I tailor each application to ATS requirements while keeping every claim grounded in verifiable evidence.`,
    ],
    ats_checklist: dedupeStrings([
      "Single-column resume structure",
      "Keywords aligned to the job description",
      "All claims grounded in baseline CV evidence",
      ...input.matchedKeywords,
    ]),
    truth_audit: input.evidence,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { jobPostId, currentResumeMarkdown } = (await request.json()) as {
      jobPostId?: string;
      currentResumeMarkdown?: string;
    };
    if (!jobPostId) {
      return NextResponse.json({ ok: false, error: "jobPostId is required." }, { status: 400 });
    }

    const client = getConvexClient();
    const context = await client.query(api.hiring.getPackagingContext, { jobPostId: jobPostId as never });
    if (!context?.job) {
      return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });
    }
    if (!context.profile) {
      return NextResponse.json({ ok: false, error: "Candidate profile missing. Import the baseline CV set first." }, { status: 400 });
    }

    const score = deriveJobScores({
      company: context.job.company,
      title: context.job.title,
      location: context.job.location,
      remoteType: context.job.remoteType,
      description: context.job.description,
      candidate: context.profile,
    });
    const evidence = score.evidenceMatches.length > 0 ? score.evidenceMatches : context.profile.evidenceExcerpts.slice(0, 6);
    const currentResumeDraft = typeof currentResumeMarkdown === "string" ? currentResumeMarkdown.trim() : "";
    const primaryCvText = currentResumeDraft || extractPrimaryCvText(context.profile.aggregatedText, context.profile.sourceFiles);

    const fallbackPackage = buildFallbackPackage({
      displayName: context.profile.displayName,
      roleTrack: context.profile.roleTrack,
      summary: context.profile.summary,
      company: context.job.company,
      title: context.job.title,
      location: context.job.location,
      matchedKeywords: context.job.matchedKeywords,
      evidence,
      primaryCvText,
    });

    const ogilvyPrompt = `Generate a tailored ATS-safe application package as strict JSON.

Return exactly this schema:
{
  "resume_markdown": "string",
  "resume_plain": "string",
  "cover_letter": "string",
  "screening_answers": ["string"],
  "ats_checklist": ["string"],
  "truth_audit": [{"sourceFile": "string", "excerpt": "string"}]
}

Rules:
- Use the BASE RESUME below as the starting scaffold, then tailor it to the target role.
- Use only the supplied evidence.
- Do not invent metrics, employers, dates, titles, or certifications.
- Resume must stay single-column and ATS-safe.
- Resume must remain substantial and submission-ready (target roughly 900-1500 words, not a compressed mini-CV).
- Keep clear sections (summary, skills, experience/impact, role alignment).
- Cover letter should be factual, direct, and under 250 words.
- Screening answers should be concise and recruiter-usable.
- truth_audit must reference only evidence items supplied below.

Candidate:
Name: ${context.profile.displayName}
Role Track: ${context.profile.roleTrack}
Summary: ${context.profile.summary}
Keywords: ${context.profile.keywords.slice(0, 20).join(", ")}

Base Resume (canonical baseline; preserve factual breadth):
${primaryCvText.slice(0, 14000)}

Current Resume Draft (if provided, improve it instead of discarding strong lines):
${currentResumeDraft ? currentResumeDraft.slice(0, 12000) : "(none provided)"}

Allowed Evidence:
${evidence.map((entry) => `- ${entry.sourceFile}: ${entry.excerpt}`).join("\n")}

Job:
Company: ${context.job.company}
Title: ${context.job.title}
Location: ${context.job.location}
Remote Type: ${context.job.remoteType}
Matched Keywords: ${context.job.matchedKeywords.join(", ")}
Description:
${context.job.description.slice(0, 7000)}`;

    const sessionScope = `${context.job.company}-${context.job.title}`;
    let generatedPackage = fallbackPackage;
    let carnegieReview: CarnegieReview | null = null;
    let fallbackUsed = true;
    let packageQuality = evaluatePackageQuality({
      packageData: fallbackPackage,
      fallbackData: fallbackPackage,
      jobTitle: context.job.title,
      company: context.job.company,
      matchedKeywords: context.job.matchedKeywords,
    });

    try {
      const { generateAgentResponse } = await import("../../../../services/llm");
      const ogilvyResponse = await generateAgentResponse(
        "Ogilvy",
        "ATS Resume Strategist",
        ogilvyPrompt,
        "",
        "",
        undefined,
        sessionScope,
      );
      const parsedOgilvy = parseJsonBlock<OgilvyPackage>(ogilvyResponse);
      if (parsedOgilvy?.resume_markdown && parsedOgilvy.cover_letter) {
        generatedPackage = normalizePackage(parsedOgilvy, fallbackPackage);
        fallbackUsed = false;

        const carnegiePrompt = `Review this ATS package and return strict JSON.

Schema:
{
  "ats_risks": ["string"],
  "final_checklist": ["string"],
  "edits": ["string"]
}

Rules:
- Focus on ATS clarity, recruiter readability, and factual safety.
- Do not rewrite the package.
- Keep each item short and actionable.

Job:
${context.job.title} at ${context.job.company}

Package:
${JSON.stringify(generatedPackage, null, 2)}`;

        const carnegieResponse = await generateAgentResponse(
          "Carnegie",
          "Recruiter-Facing ATS Reviewer",
          carnegiePrompt,
          "",
          "",
          undefined,
          `${sessionScope}-review`,
        );
        carnegieReview = parseJsonBlock<CarnegieReview>(carnegieResponse);

        let bestPackage = generatedPackage;
        let bestQuality = evaluatePackageQuality({
          packageData: generatedPackage,
          fallbackData: fallbackPackage,
          jobTitle: context.job.title,
          company: context.job.company,
          matchedKeywords: context.job.matchedKeywords,
        });

        const needsRefinement = bestQuality.score < 78 || (carnegieReview?.edits?.length ?? 0) > 0;
        if (needsRefinement) {
          const optimizePrompt = `Improve the following ATS resume package and return strict JSON with the same schema.

Rules:
- Keep all claims factual and grounded in the provided evidence/base resume.
- Do not fabricate metrics, dates, employers, or certifications.
- Increase role alignment to "${context.job.title}" at "${context.job.company}".
- Strengthen ATS keyword coverage and section clarity.
- Preserve or improve depth (do not shrink into a mini CV).

Quality findings to fix:
- Score: ${bestQuality.score}/100
- Issues: ${bestQuality.reasons.join(", ") || "none"}
- Carnegie edits: ${(carnegieReview?.edits ?? []).join("; ") || "none"}

Schema:
{
  "resume_markdown": "string",
  "resume_plain": "string",
  "cover_letter": "string",
  "screening_answers": ["string"],
  "ats_checklist": ["string"],
  "truth_audit": [{"sourceFile": "string", "excerpt": "string"}]
}

Base Resume:
${primaryCvText.slice(0, 14000)}

Allowed Evidence:
${evidence.map((entry) => `- ${entry.sourceFile}: ${entry.excerpt}`).join("\n")}

Job:
Title: ${context.job.title}
Company: ${context.job.company}
Location: ${context.job.location}
Matched Keywords: ${context.job.matchedKeywords.join(", ")}

Current Package:
${JSON.stringify(generatedPackage, null, 2)}`;

          const optimizedResponse = await generateAgentResponse(
            "Ogilvy",
            "ATS Resume Strategist",
            optimizePrompt,
            "",
            "",
            undefined,
            `${sessionScope}-optimize`,
          );
          const parsedOptimized = parseJsonBlock<OgilvyPackage>(optimizedResponse);
          if (parsedOptimized?.resume_markdown && parsedOptimized.cover_letter) {
            const optimizedPackage = normalizePackage(parsedOptimized, fallbackPackage);
            const optimizedQuality = evaluatePackageQuality({
              packageData: optimizedPackage,
              fallbackData: fallbackPackage,
              jobTitle: context.job.title,
              company: context.job.company,
              matchedKeywords: context.job.matchedKeywords,
            });
            if (optimizedQuality.score >= bestQuality.score) {
              bestPackage = optimizedPackage;
              bestQuality = optimizedQuality;
            }
          }
        }

        generatedPackage = bestPackage;
        packageQuality = bestQuality;
      }
    } catch {
      generatedPackage = fallbackPackage;
      fallbackUsed = true;
      packageQuality = evaluatePackageQuality({
        packageData: fallbackPackage,
        fallbackData: fallbackPackage,
        jobTitle: context.job.title,
        company: context.job.company,
        matchedKeywords: context.job.matchedKeywords,
      });
    }

    const fallbackQuality = evaluatePackageQuality({
      packageData: fallbackPackage,
      fallbackData: fallbackPackage,
      jobTitle: context.job.title,
      company: context.job.company,
      matchedKeywords: context.job.matchedKeywords,
    });
    if (packageQuality.score + 4 < fallbackQuality.score) {
      generatedPackage = fallbackPackage;
      packageQuality = fallbackQuality;
      fallbackUsed = true;
    }

    const atsChecklist = dedupeStrings([
      ...(generatedPackage.ats_checklist ?? []),
      ...(carnegieReview?.final_checklist ?? []),
      ...(carnegieReview?.ats_risks ?? []),
    ]);

    const saveResult = await client.mutation(api.hiring.saveApplicationPackage, {
      jobPostId: jobPostId as never,
      profileId: context.profile._id,
      variantType: "ats_resume_v1",
      contentMarkdown: generatedPackage.resume_markdown ?? fallbackPackage.resume_markdown ?? "",
      contentPlain: generatedPackage.resume_plain || stripMarkdown(generatedPackage.resume_markdown ?? ""),
      atsChecklist,
      truthAudit: (generatedPackage.truth_audit ?? fallbackPackage.truth_audit ?? []).slice(0, 8),
      coverLetter: generatedPackage.cover_letter ?? fallbackPackage.cover_letter ?? "",
      screeningAnswers: JSON.stringify(generatedPackage.screening_answers ?? fallbackPackage.screening_answers ?? []),
    });

    return NextResponse.json({
      ok: true,
      fallbackUsed,
      applicationId: saveResult.applicationId,
      resumeVariantId: saveResult.resumeVariantId,
      status: saveResult.status,
      qualityScore: packageQuality.score,
      qualityIssues: packageQuality.reasons,
      wordCount: packageQuality.wordCount,
      keywordHits: packageQuality.keywordHits,
    });
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
