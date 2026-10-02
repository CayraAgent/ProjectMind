import { spawn } from "node:child_process";
import { join } from "node:path";
import { currentCommit } from "../../git/src/index.ts";
import { nowIso, projectMindDir, stableId, writeJson, type EvidenceRecord, type ProjectConfig, type VerificationCommand } from "../../core/src/index.ts";

function run(root: string, command: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd: root, shell: true, env: process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => resolve({ exitCode: 1, stdout, stderr: `${stderr}${error.message}` }));
    child.on("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
  });
}

export async function collectCommandEvidence(root: string, item: VerificationCommand): Promise<EvidenceRecord> {
  const startedAt = nowIso();
  const start = Date.now();
  const result = await run(root, item.command);
  const finishedAt = nowIso();
  const commit = await currentCommit(root);
  const evidence: EvidenceRecord = {
    version: 1,
    id: stableId("ev", `${item.kind}:${item.command}:${startedAt}`),
    kind: item.kind,
    command: item.command,
    startedAt,
    finishedAt,
    durationMs: Date.now() - start,
    exitCode: result.exitCode,
    stdout: result.stdout.slice(-20000),
    stderr: result.stderr.slice(-20000),
    ...(commit ? { commit } : {}),
  };
  await writeJson(join(projectMindDir(root), "evidence", `${evidence.id}.json`), evidence);
  return evidence;
}

export async function collectVerificationEvidence(root: string, config: ProjectConfig): Promise<EvidenceRecord[]> {
  const evidence: EvidenceRecord[] = [];
  for (const command of config.verification.commands) evidence.push(await collectCommandEvidence(root, command));
  return evidence;
}
