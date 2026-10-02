import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { currentCommit, repositoryState } from "../../git/src/index.ts";
import { nowIso, projectMindDir, stableId, writeJson, type EvidenceRecord, type ProjectConfig, type VerificationCommand } from "../../core/src/index.ts";

function run(root: string, item: VerificationCommand): Promise<{ exitCode: number; stdout: string; stderr: string; termination?: NonNullable<EvidenceRecord["termination"]> }> {
  return new Promise((resolve) => {
    const env = { ...process.env };
    // Node test workers otherwise suppress nested node --test runs.
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(item.command, { cwd: root, shell: true, env, detached: process.platform !== "win32" });
    let stdout = "";
    let stderr = "";
    let totalBytes = 0;
    let termination: EvidenceRecord["termination"];
    const kill = () => {
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch { /* Process already exited. */ }
    };
    const timer = setTimeout(() => { termination = "timeout"; kill(); }, item.timeoutMs ?? 60_000);
    const append = (kind: "stdout" | "stderr", chunk: Buffer) => {
      totalBytes += chunk.length;
      if (kind === "stdout") stdout = (stdout + String(chunk)).slice(-20_000);
      else stderr = (stderr + String(chunk)).slice(-20_000);
      if (totalBytes > 1024 * 1024) { termination = "output-limit"; kill(); }
    };
    child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));
    child.on("error", (error) => { termination = "spawn-error"; stderr += error.message; });
    child.on("close", (code) => {
      clearTimeout(timer);
      kill();
      resolve({ exitCode: termination ? 1 : code ?? 1, stdout, stderr, ...(termination ? { termination } : {}) });
    });
  });
}

export async function collectCommandEvidence(root: string, item: VerificationCommand, runId = randomUUID()): Promise<EvidenceRecord> {
  const before = await repositoryState(root);
  const startedAt = nowIso();
  const start = Date.now();
  const result = await run(root, item);
  const finishedAt = nowIso();
  const commit = await currentCommit(root);
  const evidence: EvidenceRecord = {
    version: 1, id: stableId("ev", randomUUID()), kind: item.kind, command: item.command,
    startedAt, finishedAt, durationMs: Date.now() - start, ...result,
    runId, repositoryState: before, repositoryStateAfter: await repositoryState(root),
    ...(commit ? { commit } : {}),
  };
  await writeJson(join(projectMindDir(root), "evidence", `${evidence.id}.json`), evidence);
  return evidence;
}

export async function collectVerificationEvidence(root: string, config: ProjectConfig): Promise<EvidenceRecord[]> {
  const evidence: EvidenceRecord[] = [];
  const runId = randomUUID();
  for (const command of config.verification.commands) evidence.push(await collectCommandEvidence(root, command, runId));
  return evidence;
}
