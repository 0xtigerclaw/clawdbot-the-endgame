"use server";

import { spawn, type ChildProcess } from "child_process";
import path from "path";

// Global reference to track the process in dev mode
declare global {
    var gatewayProcess: ChildProcess | null | undefined;
}

export async function startGatewayAction() {
    if (global.gatewayProcess) {
        console.log("[ACTION] Gateway already running.");
        return { success: false, message: "Gateway already running" };
    }

    const scriptPath = path.join(process.cwd(), "gateway", "index.ts");
    console.log("[ACTION] Spawning Gateway:", scriptPath);

    // Spawn using npx tsx
    // Note: We assume npx is in path or we use full path if needed.
    // In dev environment, this inherits the shell environment.
    const subprocess = spawn("npx", ["tsx", scriptPath], {
        cwd: process.cwd(),
        stdio: "ignore", // We rely on DB logging, not stdout pipe to parent (to keep it detached-ish)
        detached: false, // We want it to die if we die? Or stay alive?
        // If detached=true, it runs independently. But we want to kill it via stop.
    });

    global.gatewayProcess = subprocess;

    subprocess.on("error", (err) => {
        console.error("[ACTION] Gateway failed to start:", err);
        global.gatewayProcess = null;
    });

    subprocess.on("exit", (code, signal) => {
        console.log(`[ACTION] Gateway exited with code ${code} signal ${signal}`);
        global.gatewayProcess = null;
    });

    return { success: true, message: "Gateway started" };
}

export async function stopGatewayAction() {
    if (global.gatewayProcess) {
        console.log("[ACTION] Stopping Gateway...");
        global.gatewayProcess.kill();
        global.gatewayProcess = null;
        return { success: true, message: "Gateway stopped" };
    }
    return { success: false, message: "Gateway not running" };
}

export async function checkGatewayStatusAction() {
    return { isRunning: !!global.gatewayProcess };
}
