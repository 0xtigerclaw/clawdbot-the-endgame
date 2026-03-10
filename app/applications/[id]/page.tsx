"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

type ApplicationDetailPageProps = {
  params: Promise<{ id: string }> | { id: string };
};

type ResumeFormatCheck = {
  key: string;
  label: string;
  pass: boolean;
  detail?: string;
};

type ResumeFormatAssessment = {
  score: number;
  wordCount: number;
  checks: ResumeFormatCheck[];
  readyForSubmission: boolean;
};

const SUBMISSION_FORMAT_THRESHOLD = 80;

function markdownToPlainText(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "- ")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function assessResumeFormatting(markdown: string): ResumeFormatAssessment {
  const plainText = markdownToPlainText(markdown);
  const wordCount = plainText
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean).length;

  const headingCount = (markdown.match(/^#{1,3}\s+/gm) ?? []).length;
  const bulletCount = (markdown.match(/^\s*[-*+]\s+/gm) ?? []).length;
  const longestLineLength = markdown
    .split("\n")
    .reduce((max, line) => Math.max(max, line.trim().length), 0);

  const checks: ResumeFormatCheck[] = [
    {
      key: "header",
      label: "Has top-level candidate header",
      pass: /^#\s+.+/m.test(markdown),
    },
    {
      key: "summary",
      label: "Has summary section",
      pass: /##\s+(Professional\s+Summary|Summary)/i.test(markdown),
    },
    {
      key: "skills",
      label: "Has skills section",
      pass: /##\s+(Role-Relevant\s+Skills|Skills|Core\s+Skills)/i.test(markdown),
    },
    {
      key: "experience",
      label: "Has experience highlights",
      pass: /##\s+(Selected\s+Experience\s+Highlights|Experience|Professional\s+Experience)/i.test(markdown),
    },
    {
      key: "bullets",
      label: "Has enough bullet points",
      pass: bulletCount >= 10,
      detail: `${bulletCount} bullets`,
    },
    {
      key: "length",
      label: "Has enough content depth",
      pass: wordCount >= 450,
      detail: `${wordCount} words`,
    },
    {
      key: "line_length",
      label: "No overly long lines",
      pass: longestLineLength <= 180,
      detail: `max line ${longestLineLength} chars`,
    },
    {
      key: "headings",
      label: "Uses clear heading structure",
      pass: headingCount >= 4,
      detail: `${headingCount} headings`,
    },
  ];

  const passed = checks.filter((check) => check.pass).length;
  const score = Math.round((passed / checks.length) * 100);
  const readyForSubmission = score >= SUBMISSION_FORMAT_THRESHOLD && wordCount >= 450;

  return {
    score,
    wordCount,
    checks,
    readyForSubmission,
  };
}

export default function ApplicationDetailPage({ params }: ApplicationDetailPageProps) {
  const [approvalNotes, setApprovalNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyStatus, setBusyStatus] = useState<string | null>(null);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [resumeDraft, setResumeDraft] = useState("");
  const [isEditingResume, setIsEditingResume] = useState(false);
  const [isSavingResume, setIsSavingResume] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isOptimizingResume, setIsOptimizingResume] = useState(false);

  useEffect(() => {
    if (typeof (params as Promise<{ id: string }>).then === "function") {
      (params as Promise<{ id: string }>)
        .then((value) => setApplicationId(value.id))
        .catch(() => setApplicationId(null));
      return;
    }
    setApplicationId((params as { id: string }).id);
  }, [params]);

  const detail = useQuery(api.hiring.getApplication, applicationId ? { id: applicationId as never } : "skip");
  const updateApplicationStatus = useMutation(api.hiring.updateApplicationStatus);
  const updateResumeVariantContent = useMutation(api.hiring.updateResumeVariantContent);
  const resumeContent = detail?.resumeVariant?.contentMarkdown ?? "";
  const activeResumeMarkdown = isEditingResume ? resumeDraft : resumeContent;
  const formatAssessment = useMemo(
    () => assessResumeFormatting(activeResumeMarkdown),
    [activeResumeMarkdown],
  );

  useEffect(() => {
    if (isEditingResume) return;
    setResumeDraft(resumeContent);
  }, [isEditingResume, resumeContent]);

  async function setStatus(status: string) {
    if (!applicationId) return;
    if (status === "submitted" && !formatAssessment.readyForSubmission) {
      setError(
        `Resume formatting check is ${formatAssessment.score}/100. Reach at least ${SUBMISSION_FORMAT_THRESHOLD}/100 before submitting.`,
      );
      return;
    }
    setBusyStatus(status);
    setMessage(null);
    setError(null);
    try {
      await updateApplicationStatus({
        id: applicationId as never,
        status,
        approvalNotes: approvalNotes || undefined,
      });
      setMessage(`Application updated to ${status.replace(/_/g, " ")}.`);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : String(mutationError));
    } finally {
      setBusyStatus(null);
    }
  }

  async function saveResumeEdits() {
    const resumeVariantId = detail?.resumeVariant?._id;
    if (!resumeVariantId) {
      setError("No resume variant is linked to this application.");
      return;
    }

    setIsSavingResume(true);
    setMessage(null);
    setError(null);
    try {
      await updateResumeVariantContent({
        id: resumeVariantId,
        contentMarkdown: resumeDraft,
      });
      setIsEditingResume(false);
      setMessage("Resume content updated.");
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : String(mutationError));
    } finally {
      setIsSavingResume(false);
    }
  }

  function cancelResumeEdits() {
    setIsEditingResume(false);
    setResumeDraft(detail?.resumeVariant?.contentMarkdown ?? "");
  }

  async function downloadResumePdf() {
    const markdown = (isEditingResume ? resumeDraft : detail?.resumeVariant?.contentMarkdown) ?? "";
    const plainText = markdownToPlainText(markdown);
    if (!plainText) {
      setError("No resume content available to export.");
      return;
    }

    setIsDownloadingPdf(true);
    setMessage(null);
    setError(null);
    try {
      const { jsPDF } = await import("jspdf");
      const pdfDoc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = pdfDoc.internal.pageSize.getWidth();
      const pageHeight = pdfDoc.internal.pageSize.getHeight();
      const margin = 48;
      const baseLineHeight = 16;
      const maxWidth = pageWidth - margin * 2;
      let y = margin;

      function writeWrappedLine(input: {
        text: string;
        fontSize: number;
        fontStyle: "normal" | "bold";
        indent?: number;
        topSpacing?: number;
      }) {
        const indent = input.indent ?? 0;
        const topSpacing = input.topSpacing ?? 0;
        y += topSpacing;

        pdfDoc.setFont("helvetica", input.fontStyle);
        pdfDoc.setFontSize(input.fontSize);
        const wrappedLines = pdfDoc.splitTextToSize(input.text, maxWidth - indent) as string[];
        for (const line of wrappedLines) {
          if (y > pageHeight - margin) {
            pdfDoc.addPage();
            y = margin;
          }
          pdfDoc.text(line, margin + indent, y);
          y += input.fontSize + 4;
        }
      }

      const markdownLines = markdown.replace(/\r\n/g, "\n").split("\n");
      for (const rawLine of markdownLines) {
        const line = rawLine.trim();
        if (!line) {
          y += baseLineHeight * 0.5;
          continue;
        }

        if (/^#\s+/.test(line)) {
          writeWrappedLine({
            text: line.replace(/^#\s+/, ""),
            fontSize: 18,
            fontStyle: "bold",
            topSpacing: 4,
          });
          continue;
        }

        if (/^##\s+/.test(line)) {
          writeWrappedLine({
            text: line.replace(/^##\s+/, ""),
            fontSize: 14,
            fontStyle: "bold",
            topSpacing: 8,
          });
          continue;
        }

        if (/^###\s+/.test(line)) {
          writeWrappedLine({
            text: line.replace(/^###\s+/, ""),
            fontSize: 12,
            fontStyle: "bold",
            topSpacing: 6,
          });
          continue;
        }

        if (/^[-*+]\s+/.test(line)) {
          writeWrappedLine({
            text: `- ${line.replace(/^[-*+]\s+/, "")}`,
            fontSize: 11,
            fontStyle: "normal",
            indent: 12,
          });
          continue;
        }

        writeWrappedLine({
          text: line,
          fontSize: 11,
          fontStyle: "normal",
        });
      }

      const companySlug = toSlug(detail?.job?.company ?? "company");
      const titleSlug = toSlug(detail?.job?.title ?? "role");
      const fileName = `${companySlug || "company"}-${titleSlug || "role"}-cv.pdf`;
      pdfDoc.save(fileName);
      setMessage("Resume downloaded as PDF.");
    } catch (pdfError) {
      setError(pdfError instanceof Error ? pdfError.message : String(pdfError));
    } finally {
      setIsDownloadingPdf(false);
    }
  }

  async function optimizeResumeForRole() {
    const jobPostId = detail?.application.jobPostId;
    const currentResumeMarkdown = (isEditingResume ? resumeDraft : detail?.resumeVariant?.contentMarkdown) ?? "";
    if (!jobPostId) {
      setError("Job context missing for resume optimization.");
      return;
    }

    setIsOptimizingResume(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/hiring/package", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ jobPostId, currentResumeMarkdown }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        qualityScore?: number;
        fallbackUsed?: boolean;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Resume optimization failed.");
      }

      setIsEditingResume(false);
      const qualitySuffix = typeof payload.qualityScore === "number"
        ? ` Quality score: ${payload.qualityScore}/100.`
        : "";
      const modeSuffix = payload.fallbackUsed ? " Used baseline optimization path." : " Used full AI tailoring path.";
      setMessage(`Resume re-tailored for this role.${qualitySuffix}${modeSuffix}`);
    } catch (optimizationError) {
      setError(optimizationError instanceof Error ? optimizationError.message : String(optimizationError));
    } finally {
      setIsOptimizingResume(false);
    }
  }

  if (!applicationId || detail === undefined) {
    return <div className="min-h-screen bg-gray-50 p-8 text-sm text-gray-600">Loading application...</div>;
  }

  if (!detail) {
    return <div className="min-h-screen bg-gray-50 p-8 text-sm text-red-600">Application not found.</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 text-black">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/applications" className="text-sm text-gray-500 hover:text-black">← Back to applications</Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{detail.job?.title ?? "Untitled role"}</h1>
            <p className="mt-2 text-sm text-gray-600">{detail.job?.company ?? "Unknown company"} · {detail.job?.location ?? "Location unavailable"}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => setStatus("approved")} disabled={Boolean(busyStatus)} className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-100">Approve</button>
            <button onClick={() => setStatus("reject")} disabled={Boolean(busyStatus)} className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100">Reject</button>
            <button
              onClick={() => setStatus("submitted")}
              disabled={Boolean(busyStatus) || !formatAssessment.readyForSubmission}
              className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Mark Submitted
            </button>
            <div className={`self-center text-xs ${formatAssessment.readyForSubmission ? "text-emerald-700" : "text-amber-700"}`}>
              Format QA: {formatAssessment.score}/100
            </div>
          </div>
        </header>

        {(message || error || busyStatus) && (
          <div className="space-y-2">
            {busyStatus && <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">Updating: {busyStatus.replace(/_/g, " ")}</div>}
            {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
            {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          </div>
        )}

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-lg font-semibold">ATS Resume Variant</h2>
                <div className="flex flex-wrap gap-2">
                  {!isEditingResume && (
                    <button
                      onClick={() => setIsEditingResume(true)}
                      disabled={!detail.resumeVariant || isSavingResume || isDownloadingPdf || isOptimizingResume}
                      className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Edit CV
                    </button>
                  )}
                  {!isEditingResume && (
                    <button
                      onClick={optimizeResumeForRole}
                      disabled={isSavingResume || isDownloadingPdf || isOptimizingResume}
                      className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isOptimizingResume ? "Re-tailoring..." : "Re-tailor CV"}
                    </button>
                  )}
                  {isEditingResume && (
                    <>
                      <button
                        onClick={saveResumeEdits}
                        disabled={isSavingResume || isDownloadingPdf || isOptimizingResume}
                        className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSavingResume ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={cancelResumeEdits}
                        disabled={isSavingResume || isDownloadingPdf || isOptimizingResume}
                        className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  <button
                    onClick={downloadResumePdf}
                    disabled={isSavingResume || isDownloadingPdf || isOptimizingResume || !resumeDraft.trim()}
                    className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDownloadingPdf ? "Preparing PDF..." : "Download PDF"}
                  </button>
                </div>
              </div>

              {isEditingResume ? (
                <div className="mt-5 space-y-4">
                  <textarea
                    value={resumeDraft}
                    onChange={(event) => setResumeDraft(event.target.value)}
                    className="min-h-[420px] w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm leading-6 text-gray-800"
                    placeholder="Edit the resume markdown here..."
                  />
                  <p className="text-xs text-gray-500">
                    Manual edits are saved only to this application variant.
                  </p>
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Preview</div>
                    <div className="prose prose-sm mt-3 max-w-none rounded-2xl border border-gray-100 bg-gray-50 p-4 prose-headings:font-semibold prose-p:text-gray-700 prose-li:text-gray-700">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {resumeDraft || "No resume content."}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="prose prose-sm mt-5 max-w-none prose-headings:font-semibold prose-p:text-gray-700 prose-li:text-gray-700">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {detail.resumeVariant?.contentMarkdown ?? "No resume variant stored."}
                  </ReactMarkdown>
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Cover Letter</h2>
              <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-gray-700">{detail.application.coverLetter}</div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Screening Answers</h2>
              <div className="mt-4 space-y-3">
                {detail.screeningAnswersList.map((answer, index) => (
                  <div key={`${index}-${answer.slice(0, 16)}`} className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-700">
                    {answer}
                  </div>
                ))}
                {detail.screeningAnswersList.length === 0 && <div className="text-sm text-gray-500">No screening answers stored.</div>}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Review Controls</h2>
              <div className="mt-5 space-y-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Status</div>
                  <div className="mt-2 text-sm font-semibold">{detail.application.status.replace(/_/g, " ")}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Approval Notes</div>
                  <textarea
                    value={approvalNotes}
                    onChange={(event) => setApprovalNotes(event.target.value)}
                    className="mt-2 min-h-[120px] w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm"
                    placeholder="What should change before submission?"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Formatting QA</h2>
                <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  formatAssessment.readyForSubmission ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                }`}>
                  {formatAssessment.score}/100
                </div>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                Submission unlocks at {SUBMISSION_FORMAT_THRESHOLD}/100 with at least 450 words.
              </p>
              <div className="mt-4 space-y-2">
                {formatAssessment.checks.map((check) => (
                  <div key={check.key} className="rounded-2xl bg-gray-50 px-4 py-3 text-sm">
                    <div className={`font-semibold ${check.pass ? "text-emerald-700" : "text-amber-700"}`}>
                      {check.pass ? "Pass" : "Needs Work"} - {check.label}
                    </div>
                    {check.detail && <div className="mt-1 text-xs text-gray-600">{check.detail}</div>}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">ATS Checklist</h2>
              <div className="mt-4 space-y-2">
                {detail.atsChecklist.map((item) => (
                  <div key={item} className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Truth Audit</h2>
              <div className="mt-4 space-y-3">
                {detail.truthAudit.map((entry) => (
                  <div key={`${entry.sourceFile}-${entry.excerpt.slice(0, 16)}`} className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-700">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{entry.sourceFile}</div>
                    <div className="mt-2">{entry.excerpt}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Inbox Signals</h2>
              <div className="mt-4 space-y-3">
                {detail.signals.map((signal) => (
                  <div key={signal._id} className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-700">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold">{signal.subject}</div>
                      <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{signal.classification}</div>
                    </div>
                    <div className="mt-2 text-xs text-gray-500">{signal.sender} · {new Date(signal.receivedAt).toLocaleString()}</div>
                    <div className="mt-3">{signal.snippet}</div>
                  </div>
                ))}
                {detail.signals.length === 0 && <div className="text-sm text-gray-500">No linked email feedback yet.</div>}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
