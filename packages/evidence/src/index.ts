import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { currentCommit, repositoryState } from "../../git/src/index.ts";
import { nowIso, projectMindDir, stableId, writeJson, type EvidenceRecord, type ProjectConfig, type VerificationCommand } from "../../core/src/index.ts";

type XmlRecord = Record<string, unknown>;

function records(value: unknown): XmlRecord[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter((item): item is XmlRecord => typeof item === "object" && item !== null);
}

function collectTestCases(node: unknown): XmlRecord[] {
  return records(node).flatMap((item) => [
    ...records(item.testcase),
    ...collectTestCases(item.testsuite),
    ...collectTestCases(item.testsuites),
  ]);
}

export function parseNodeTestJunit(stdout: string): NonNullable<EvidenceRecord["testSummary"]> {
  if (/<!DOCTYPE/i.test(stdout)) throw new Error("Invalid JUnit XML: document types are not allowed.");
  const validation = XMLValidator.validate(stdout);
  if (validation !== true) throw new Error(`Invalid JUnit XML: ${validation.err.msg}`);
  let parsed: XmlRecord;
  try {
    parsed = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      parseAttributeValue: true,
      processEntities: { maxEntitySize: 1000, maxTotalExpansions: 1000, maxExpandedLength: 100_000, maxEntityCount: 100 },
      maxNestedTags: 50,
    }).parse(stdout) as XmlRecord;
  } catch (error) {
    throw new Error(`Invalid JUnit XML: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!("testsuites" in parsed) && !("testsuite" in parsed)) {
    throw new Error("Invalid JUnit XML: expected a testsuites or testsuite root element.");
  }
  const cases = collectTestCases(parsed.testsuites ?? parsed.testsuite).map((item) => {
    const name = typeof item["@_name"] === "string" ? item["@_name"] : "";
    if (!name) throw new Error("JUnit testcase is missing a name.");
    const classname = typeof item["@_classname"] === "string" ? item["@_classname"] : undefined;
    const file = typeof item["@_file"] === "string" ? item["@_file"] : undefined;
    const status = item.failure !== undefined || item.error !== undefined ? "failed" : item.skipped !== undefined ? "skipped" : "passed";
    const seconds = typeof item["@_time"] === "number" ? item["@_time"] : Number(item["@_time"]);
    return {
      id: stableId("test", `${file ?? ""}:${classname ?? ""}:${name}`),
      name,
      ...(classname ? { classname } : {}),
      ...(file ? { file } : {}),
      status,
      ...(Number.isFinite(seconds) ? { durationMs: seconds * 1000 } : {}),
    } as const;
  });
  return {
    provider: "node-test-junit",
    discovered: cases.length,
    passed: cases.filter((item) => item.status === "passed").length,
    failed: cases.filter((item) => item.status === "failed").length,
    skipped: cases.filter((item) => item.status === "skipped").length,
    cases,
  };
}

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
        if (process.platform === "win32" && child.pid) {
          spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        } else if (child.pid) {
          process.kill(-child.pid, "SIGKILL");
        }
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
      if (process.platform !== "win32") kill();
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
  let testSummary: EvidenceRecord["testSummary"];
  let evidenceError: string | undefined;
  if (item.provider === "node-test-junit") {
    try {
      testSummary = parseNodeTestJunit(result.stdout);
    } catch (error) {
      evidenceError = error instanceof Error ? error.message : String(error);
    }
  }
  const evidence: EvidenceRecord = {
    version: 1, id: stableId("ev", randomUUID()), kind: item.kind, command: item.command,
    startedAt, finishedAt, durationMs: Date.now() - start, ...result,
    runId, repositoryState: before, repositoryStateAfter: await repositoryState(root),
    provider: item.provider ?? "generic-command",
    ...(testSummary ? { testSummary } : {}),
    ...(evidenceError ? { evidenceError } : {}),
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
