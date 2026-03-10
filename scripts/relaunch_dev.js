/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const runDir = path.join(rootDir, ".run");
fs.mkdirSync(runDir, { recursive: true });

const logFile = path.join(runDir, "dev_all.log");
const pidFile = path.join(runDir, "dev_all.pid");

// If already running, don't spawn another stack.
if (fs.existsSync(pidFile)) {
  const existingPid = Number(fs.readFileSync(pidFile, "utf8").trim());
  if (Number.isFinite(existingPid) && existingPid > 0) {
    try {
      process.kill(existingPid, 0);
      console.log(`dev:all already running (pid ${existingPid}). Logs: ${logFile}`);
      process.exit(0);
    } catch {
      // stale pid file; continue
    }
  }
}

const out = fs.openSync(logFile, "a");
const err = fs.openSync(logFile, "a");

console.log(`Starting dev:all in background... Logs: ${logFile}`);

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const env = { ...process.env };

const child = spawn(npmCmd, ["run", "dev:all"], {
  cwd: rootDir,
  env,
  detached: true,
  stdio: ["ignore", out, err],
});

fs.writeFileSync(pidFile, String(child.pid), "utf8");

child.unref();
process.exit(0);
