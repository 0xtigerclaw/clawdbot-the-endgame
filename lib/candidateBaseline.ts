import path from "node:path";

const CANDIDATE_PROFILE_DIR = path.join(process.cwd(), "data", "candidate-profile");

export const BASELINE_DISPLAY_NAME = process.env.MISSION_CONTROL_PROFILE_NAME || "Candidate";
export const BASELINE_CV_FILES = [
  "resume-primary.pdf",
  "resume-alt.pdf",
].map((fileName) => path.join(CANDIDATE_PROFILE_DIR, fileName));

export const BASELINE_ROLE_TRACK = process.env.MISSION_CONTROL_ROLE_TRACK || "Solutions Architect, Applied AI";
export const BASELINE_LOCATIONS = ["Netherlands", "EEA", "Remote"];
export const BASELINE_WORK_MODES = ["Remote", "Hybrid"];

export const SUPPLEMENTAL_EVIDENCE_FILES = [
  "candidate-notes.md",
  "project-evidence.md",
].map((fileName) => path.join(CANDIDATE_PROFILE_DIR, fileName));

export const SUPPLEMENTAL_EVIDENCE_URLS = [
  process.env.MISSION_CONTROL_EVIDENCE_URL_1 || "",
  process.env.MISSION_CONTROL_EVIDENCE_URL_2 || "",
  process.env.MISSION_CONTROL_EVIDENCE_URL_3 || "",
].filter(Boolean);

export const GITHUB_PROFILE_USERNAME = process.env.MISSION_CONTROL_GITHUB_USERNAME || "";
export const GITHUB_REPOS_FOR_EVIDENCE = (process.env.MISSION_CONTROL_GITHUB_REPOS || "")
  .split(",")
  .map((repo) => repo.trim())
  .filter(Boolean);

export const EVIDENCE_PRIORITY_TERMS = [
  "ai",
  "applied",
  "architect",
  "architecture",
  "automation",
  "clawdbot",
  "claude",
  "claude code",
  "codex",
  "context engineering",
  "convex",
  "deployment",
  "edge",
  "enablement",
  "enterprise",
  "enterprise ai",
  "federated",
  "gateway",
  "guided labs",
  "healthcare",
  "integration",
  "instruction",
  "multi-agent",
  "openclaw",
  "orchestration",
  "privacy",
  "review loops",
  "solution",
  "tooling",
  "training",
  "workflow",
  "workshop",
] as const;
