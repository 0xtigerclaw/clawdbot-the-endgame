"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../convex/_generated/api";

type JobStatus = "all" | "new" | "shortlisted" | "watchlist" | "rejected" | "package_ready";

export default function JobsPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<JobStatus>("all");
  const [provider, setProvider] = useState("greenhouse");
  const [name, setName] = useState("");
  const [boardToken, setBoardToken] = useState("");
  const [url, setUrl] = useState("");
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summary = useQuery(api.hiring.getDashboardSummary, {});
  const profile = useQuery(api.hiring.getActiveCandidateProfile, {});
  const sources = useQuery(api.hiring.listJobSources, {});
  const jobs = useQuery(api.hiring.listJobPosts, { status: statusFilter, limit: 200 });

  const upsertJobSource = useMutation(api.hiring.upsertJobSource);
  const toggleJobSource = useMutation(api.hiring.toggleJobSource);
  const syncSource = useAction(api.hiringActions.syncJobSource);
  const syncAllSources = useAction(api.hiringActions.syncAllActiveJobSources);

  const shortlistedCount = useMemo(
    () => (jobs ?? []).filter((job) => job.status === "shortlisted" || job.status === "package_ready" || job.status === "watchlist").length,
    [jobs],
  );

  const sourceUrlPlaceholder = useMemo(() => {
    if (provider === "ashby") return "https://jobs.ashbyhq.com/openai";
    if (provider === "lever") return "https://jobs.lever.co/company";
    return "https://boards.greenhouse.io/company";
  }, [provider]);

  async function handleImportProfile() {
    setBusyLabel("Importing CVs and recent evidence...");
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/hiring/profile/import", { method: "POST" });
      const payload = (await response.json()) as { ok: boolean; error?: string; evidenceCount?: number; sourceCount?: number };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Profile import failed.");
      }
      setMessage(`Profile imported from ${payload.sourceCount ?? 0} sources. Evidence excerpts stored: ${payload.evidenceCount ?? 0}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleAddSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyLabel("Saving source...");
    setMessage(null);
    setError(null);
    try {
      await upsertJobSource({
        name,
        provider,
        boardToken,
        url: url || undefined,
        active: true,
      });
      setName("");
      setBoardToken("");
      setUrl("");
      setMessage("Job source saved.");
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : String(mutationError));
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleSyncAll() {
    setBusyLabel("Syncing active job boards...");
    setMessage(null);
    setError(null);
    try {
      const result = await syncAllSources({});
      setMessage(`Synced ${result.syncedSources} active sources.`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleSyncSource(sourceId: string) {
    setBusyLabel("Syncing source...");
    setMessage(null);
    setError(null);
    try {
      const result = await syncSource({ sourceId: sourceId as never });
      setMessage(`Processed ${result.processed} jobs from ${result.provider}.`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleGeneratePackage(jobPostId: string) {
    setBusyLabel("Generating application package...");
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/hiring/package", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ jobPostId }),
      });
      const payload = (await response.json()) as { ok: boolean; applicationId?: string; error?: string };
      if (!response.ok || !payload.ok || !payload.applicationId) {
        throw new Error(payload.error || "Package generation failed.");
      }
      router.push(`/applications/${payload.applicationId}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setBusyLabel(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-black">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-gray-500 font-semibold">Hiring Engine</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Job Feed + ATS Pipeline</h1>
            <p className="mt-2 text-sm text-gray-600 max-w-3xl">
              Pull public ATS job feeds, score fit against the imported candidate profile, and generate factual resume packages for review.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/applications" className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-100">
              Applications
            </Link>
            <Link href="/setup/email" className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-100">
              Email Feedback
            </Link>
            <button
              onClick={handleImportProfile}
              className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
              disabled={Boolean(busyLabel)}
            >
              Import Profile Evidence
            </button>
            <button
              onClick={handleSyncAll}
              className="rounded-full border border-black px-4 py-2 text-sm font-semibold hover:bg-black hover:text-white"
              disabled={Boolean(busyLabel) || !profile}
            >
              Sync Active Sources
            </button>
          </div>
        </header>

        {(message || error || busyLabel) && (
          <div className="space-y-2">
            {busyLabel && <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">{busyLabel}</div>}
            {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
            {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Candidate</div>
            <div className="mt-3 text-2xl font-semibold">{summary?.hasProfile ? "Ready" : "Missing"}</div>
            <div className="mt-2 text-sm text-gray-600">{profile?.roleTrack ?? "Import CVs plus recent evidence to unlock scoring."}</div>
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Sources</div>
            <div className="mt-3 text-2xl font-semibold">{summary?.activeSourceCount ?? 0}</div>
            <div className="mt-2 text-sm text-gray-600">Active feeds from Greenhouse, Lever, and Ashby.</div>
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Shortlist</div>
            <div className="mt-3 text-2xl font-semibold">{shortlistedCount}</div>
            <div className="mt-2 text-sm text-gray-600">Roles currently above the fit and ATS gate.</div>
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Applications</div>
            <div className="mt-3 text-2xl font-semibold">{summary?.totalApplications ?? 0}</div>
            <div className="mt-2 text-sm text-gray-600">Generated packages awaiting review or already submitted.</div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Candidate Profile</h2>
                <p className="mt-1 text-sm text-gray-600">The imported profile is the factual constraint for every resume variant.</p>
              </div>
              <div className={`rounded-full px-3 py-1 text-xs font-semibold ${profile ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {profile ? "Imported" : "Not Imported"}
              </div>
            </div>
            {profile ? (
              <div className="mt-5 space-y-4">
                <div>
                  <div className="text-sm font-semibold">{profile.displayName}</div>
                  <div className="mt-1 text-sm text-gray-600">{profile.summary}</div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Evidence Sources</div>
                    <div className="mt-2 text-sm text-gray-700">{profile.sourceFiles.length}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Evidence Excerpts</div>
                    <div className="mt-2 text-sm text-gray-700">{profile.evidenceExcerpts.length}</div>
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Keywords</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {profile.keywords.slice(0, 18).map((keyword) => (
                      <span key={keyword} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Locations</div>
                    <div className="mt-2 text-sm text-gray-700">{profile.preferredLocations.join(", ")}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Work Modes</div>
                    <div className="mt-2 text-sm text-gray-700">{profile.workModes.join(", ")}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
                Import the CV PDFs plus recent evidence before you sync feeds or generate any package.
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Add Job Source</h2>
            <p className="mt-1 text-sm text-gray-600">Greenhouse, Lever, and Ashby are supported because they expose stable public job feeds.</p>
            <form className="mt-5 space-y-4" onSubmit={handleAddSource}>
              <label className="block text-sm font-medium text-gray-700">
                Provider
                <select
                  value={provider}
                  onChange={(event) => setProvider(event.target.value)}
                  className="mt-1 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm"
                >
                  <option value="greenhouse">Greenhouse</option>
                  <option value="lever">Lever</option>
                  <option value="ashby">Ashby</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Company / Source Name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-1 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm"
                  placeholder="OpenAI"
                  required
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Board Token
                <input
                  value={boardToken}
                  onChange={(event) => setBoardToken(event.target.value)}
                  className="mt-1 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm"
                  placeholder="openai"
                  required
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Board URL (optional)
                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  className="mt-1 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm"
                  placeholder={sourceUrlPlaceholder}
                />
              </label>
              <button type="submit" className="w-full rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800" disabled={Boolean(busyLabel)}>
                Save Source
              </button>
            </form>
          </div>
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Configured Sources</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(sources ?? []).map((source) => (
              <div key={source._id} className="rounded-2xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{source.name}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-gray-500">{source.provider}</div>
                  </div>
                  <button
                    onClick={() => toggleJobSource({ id: source._id, active: !source.active })}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${source.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}
                  >
                    {source.active ? "Active" : "Paused"}
                  </button>
                </div>
                <div className="mt-3 text-xs text-gray-600 break-all">{source.url}</div>
                <div className="mt-4 flex gap-2 items-center">
                  <button
                    onClick={() => handleSyncSource(String(source._id))}
                    className="rounded-full border border-gray-200 px-3 py-2 text-xs font-semibold hover:bg-gray-100"
                    disabled={Boolean(busyLabel) || !profile}
                  >
                    Sync Source
                  </button>
                  {source.lastFetchedAt && <div className="text-xs text-gray-500">{new Date(source.lastFetchedAt).toLocaleDateString()}</div>}
                </div>
                {source.lastError && <div className="mt-3 text-xs text-red-600">{source.lastError}</div>}
              </div>
            ))}
            {(sources ?? []).length === 0 && (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
                No sources configured yet.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Scored Jobs</h2>
              <p className="mt-1 text-sm text-gray-600">Shortlisted and watchlist roles can move into package generation. Rejected roles stay visible for future threshold tuning.</p>
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as JobStatus)}
              className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="watchlist">Watchlist</option>
              <option value="package_ready">Package ready</option>
              <option value="rejected">Rejected</option>
              <option value="new">New</option>
            </select>
          </div>

          <div className="mt-6 space-y-4">
            {(jobs ?? []).map((job) => (
              <div key={job._id} className="rounded-2xl border border-gray-200 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold">{job.title}</h3>
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">{job.company}</span>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          job.status === "shortlisted" || job.status === "package_ready"
                            ? "bg-emerald-50 text-emerald-700"
                            : job.status === "watchlist"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {job.status.replace(/_/g, " ")}
                      </span>
                      {job.applicationStatus && (
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                          application: {job.applicationStatus.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">
                      {job.location} · {job.remoteType} · {job.sourceName} ({job.sourceProvider})
                    </div>
                    <p className="text-sm text-gray-700 max-w-4xl">{job.scoreReason}</p>
                    <div className="flex flex-wrap gap-2">
                      {job.matchedKeywords.slice(0, 10).map((keyword) => (
                        <span key={keyword} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="min-w-[220px] rounded-2xl bg-gray-50 p-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Fit</div>
                        <div className="mt-1 text-2xl font-semibold">{job.fitScore}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.18em] text-gray-500">ATS</div>
                        <div className="mt-1 text-2xl font-semibold">{job.atsScore}</div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-col gap-2">
                      <a href={job.url} target="_blank" rel="noreferrer" className="rounded-full border border-gray-200 bg-white px-4 py-2 text-center text-sm font-semibold hover:bg-gray-100">
                        Open ATS Post
                      </a>
                      {(job.status === "shortlisted" || job.status === "package_ready" || job.status === "watchlist") && (
                        <button
                          onClick={() => handleGeneratePackage(String(job._id))}
                          className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
                          disabled={Boolean(busyLabel) || !profile}
                        >
                          {job.applicationId ? "Regenerate Package" : "Generate Package"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {(jobs ?? []).length === 0 && (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600">
                No jobs loaded for this filter yet. Import the baseline, add a source, and sync.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
