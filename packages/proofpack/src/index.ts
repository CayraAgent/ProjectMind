import { join } from "node:path";
import { nowIso, projectMindDir, stableId, writeJson, type ChangeSummary, type EvidenceRecord, type IntentContract, type ProofPack, type VerificationResult } from "../../core/src/index.ts";

export async function createProofPack(
  root: string,
  projectName: string,
  intent: IntentContract,
  change: ChangeSummary,
  evidence: EvidenceRecord[],
  verification: VerificationResult,
): Promise<ProofPack> {
  const createdAt = nowIso();
  const proof: ProofPack = {
    version: 1,
    id: stableId("proof", `${intent.id}:${change.commit ?? "working-tree"}:${createdAt}`),
    createdAt,
    project: projectName,
    ...(change.commit ? { commit: change.commit } : {}),
    intent,
    change,
    evidence,
    verification,
  };
  const suffix = (change.commit ?? "working-tree").slice(0, 10);
  await writeJson(join(projectMindDir(root), "proofs", `${intent.id}-${suffix}-${proof.id}.json`), proof);
  await writeJson(join(projectMindDir(root), "latest-proof.json"), proof);
  return proof;
}
