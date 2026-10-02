import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type EvidenceKind = "test" | "build" | "typecheck" | "lint" | "static" | "runtime" | "command";
export type VerificationStatus = "VERIFIED" | "PARTIALLY_VERIFIED" | "NOT_VERIFIED" | "BLOCKED";

export interface VerificationCommand {
  kind: EvidenceKind;
  command: string;
  required: boolean;
}

export interface ProjectConfig {
  version: 1;
  project: {
    name: string;
    root: string;
    packageManager?: string;
  };
  scanner: {
    include: string[];
    extensions: string[];
    exclude: string[];
  };
  verification: {
    commands: VerificationCommand[];
  };
}

export interface GraphNode {
  id: string;
  type: "FILE" | "MODULE" | "FUNCTION" | "CLASS" | "TEST" | "PACKAGE";
  name: string;
  path?: string;
  line?: number;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  type: "CONTAINS" | "IMPORTS" | "DEPENDS_ON" | "TESTED_BY";
  from: string;
  to: string;
  metadata?: Record<string, unknown>;
}

export interface MindGraph {
  version: 1;
  generatedAt: string;
  parser: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Requirement {
  id: string;
  statement: string;
  critical: boolean;
  evidenceKinds: EvidenceKind[];
}

export interface IntentContract {
  version: 1;
  id: string;
  title: string;
  createdAt: string;
  requirements: Requirement[];
  preserve: string[];
  outOfScope: string[];
}

export interface EvidenceRecord {
  version: 1;
  id: string;
  kind: EvidenceKind;
  command?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  exitCode: number;
  stdout: string;
  stderr: string;
  commit?: string;
}

export interface RequirementVerification {
  requirementId: string;
  status: "VERIFIED" | "UNVERIFIED" | "FAILED";
  evidenceIds: string[];
  reason?: string;
}

export interface VerificationResult {
  version: 1;
  status: VerificationStatus;
  intentId: string;
  generatedAt: string;
  requiredCommandResults: Array<{
    kind: EvidenceKind;
    status: "PASS" | "FAIL" | "MISSING";
    evidenceId?: string;
  }>;
  requirements: RequirementVerification[];
  reasons: string[];
}

export interface ChangeSummary {
  commit?: string;
  files: string[];
  changedSymbols: Array<{ id: string; name: string; type: GraphNode["type"]; path?: string }>;
  affectedFiles: string[];
}

export interface ProofPack {
  version: 1;
  id: string;
  createdAt: string;
  project: string;
  commit?: string;
  intent: IntentContract;
  change: ChangeSummary;
  evidence: EvidenceRecord[];
  verification: VerificationResult;
}

export const projectMindDir = (root: string): string => join(root, ".projectmind");

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function stableId(prefix: string, input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
