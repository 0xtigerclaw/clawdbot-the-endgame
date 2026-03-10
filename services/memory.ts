import * as fs from 'fs';
import * as path from 'path';

const MEMORY_DIR = path.join(process.cwd(), 'memory');

// Ensure directory exists
function ensureDir(dir: string) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// Get today's date in YYYY-MM-DD format
function getToday(): string {
    return new Date().toISOString().split('T')[0];
}

// Read WORKING.md
export function readWorkingMemory(): string {
    const filePath = path.join(MEMORY_DIR, 'WORKING.md');
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch {
        return '';
    }
}

// Write to WORKING.md
export function updateWorkingMemory(content: string): void {
    const filePath = path.join(MEMORY_DIR, 'WORKING.md');
    ensureDir(MEMORY_DIR);
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('[MEMORY] WORKING.md updated');
}

// Read MEMORY.md (long-term)
export function readLongTermMemory(): string {
    const filePath = path.join(MEMORY_DIR, 'MEMORY.md');
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch {
        return '';
    }
}

// Append to MEMORY.md
export function appendToMemory(entry: string): void {
    const filePath = path.join(MEMORY_DIR, 'MEMORY.md');
    ensureDir(MEMORY_DIR);
    const existing = readLongTermMemory();
    const timestamp = new Date().toISOString();
    const newEntry = `\n- **${timestamp}**: ${entry}`;
    fs.writeFileSync(filePath, existing + newEntry, 'utf-8');
    console.log('[MEMORY] MEMORY.md updated');
}

// Log to daily notes
export function logToDaily(agentName: string, action: string, details: string): void {
    const today = getToday();
    const dailyDir = path.join(MEMORY_DIR, 'daily');
    ensureDir(dailyDir);

    const filePath = path.join(dailyDir, `${today}.md`);
    const timestamp = new Date().toLocaleTimeString();
    const entry = `\n## ${timestamp} - ${agentName}\n**Action:** ${action}\n${details}\n`;

    let existing = '';
    try {
        existing = fs.readFileSync(filePath, 'utf-8');
    } catch {
        // File doesn't exist yet, create header
        existing = `# Daily Log: ${today}\n\n---\n`;
    }

    fs.writeFileSync(filePath, existing + entry, 'utf-8');
    console.log(`[MEMORY] Daily log updated: ${today}.md`);
}

// Set active task context
export function setActiveTask(taskTitle: string, agentName: string): void {
    const workingContent = `# WORKING MEMORY

This file tracks the current context and active work.

## Active Context
**Current Task:** ${taskTitle}
**Assigned Agent:** ${agentName}
**Started:** ${new Date().toISOString()}

## Recent Decisions
*In progress*

## Pending Actions
- Complete the assigned task
- Generate mission report

---
*Last updated: ${new Date().toISOString()}*
`;
    updateWorkingMemory(workingContent);
}

// Clear active task
export function clearActiveTask(): void {
    const workingContent = `# WORKING MEMORY

This file tracks the current context and active work.

## Active Context
*No active task*

## Recent Decisions
*None recorded*

## Pending Actions
*None*

---
*Last updated: ${new Date().toISOString()}*
`;
    updateWorkingMemory(workingContent);
}
