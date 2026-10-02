import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { claimRecordSchema, proofPackSchema } from "../../core/src/schema.ts";
import {
  nowIso,
  projectMindDir,
  readJson,
  stableId,
  writeJson,
  type ClaimAssessment,
  type ClaimRecord,
  type ProofPack,
} from "../../core/src/index.ts";

export interface ClaimBinding {
  evidenceIds?: string[];
  intentId?: string;
  requirementId?: string;
}

export async function recordClaim(root: string, text: string, binding: ClaimBinding = {}): Promise<ClaimRecord> {
  const createdAt = nowIso();
  const claim = claimRecordSchema.parse({
    version: 1,
    id: stableId("claim", `${text}:${createdAt}`),
    text,
    createdAt,
    status: "UNPROVEN",
    evidenceIds: binding.evidenceIds ?? [],
    ...(binding.intentId ? { intentId: binding.intentId } : {}),
    ...(binding.requirementId ? { requirementId: binding.requirementId } : {}),
  }) as ClaimRecord;
  await writeJson(join(projectMindDir(root), "claims", `${claim.id}.json`), claim);
  return claim;
}

export function assessClaim(claim: ClaimRecord, proof?: ProofPack): ClaimAssessment {
  if (!proof) return { claim, strength: "DECLARED_ONLY", resolvedEvidenceIds: [], reasons: ["No historical ProofPack is available."] };

  const passingIds = new Set(proof.evidence.filter((item) => item.exitCode === 0
    && !item.termination && !item.evidenceError
    && item.repositoryState === proof.verification.repositoryState
    && item.repositoryStateAfter === proof.verification.repositoryState).map((item) => item.id));
  const resolvedEvidenceIds = claim.evidenceIds.filter((id) => passingIds.has(id));
  const allEvidenceResolves = claim.evidenceIds.length > 0 && resolvedEvidenceIds.length === claim.evidenceIds.length;
  const requirement = proof.verification.requirements.find((item) => item.requirementId === claim.requirementId);
  const requirementLinked = Boolean(allEvidenceResolves
    && claim.intentId === proof.intent.id
    && requirement?.status === "VERIFIED"
    && claim.evidenceIds.every((id) => requirement.evidenceIds.includes(id)));

  if (requirementLinked) {
    return { claim, strength: "VERIFIED_REQUIREMENT_LINKED", proofId: proof.id, resolvedEvidenceIds, reasons: ["All links resolve to passing evidence bound to a verified requirement in this historical ProofPack."] };
  }
  if (allEvidenceResolves) {
    return { claim, strength: "EVIDENCE_LINKED", proofId: proof.id, resolvedEvidenceIds, reasons: ["All evidence links resolve to passing records in this historical ProofPack, but not to a verified requirement binding."] };
  }
  const missing = claim.evidenceIds.filter((id) => !passingIds.has(id));
  return {
    claim,
    strength: "DECLARED_ONLY",
    proofId: proof.id,
    resolvedEvidenceIds,
    reasons: [claim.evidenceIds.length ? `Evidence links are absent, stale, or non-passing: ${missing.join(", ")}.` : "The claim has no explicit evidence links."],
  };
}

export async function getClaimReport(root: string): Promise<{ historical: true; proofId?: string; assessments: ClaimAssessment[] }> {
  const directory = join(projectMindDir(root), "claims");
  const names = await readdir(directory).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : Promise.reject(error));
  const claims = await Promise.all(names.filter((name) => name.endsWith(".json")).sort().map(async (name) => claimRecordSchema.parse(await readJson(join(directory, name))) as ClaimRecord));
  const proof = await readJson(join(projectMindDir(root), "latest-proof.json"))
    .then((value) => proofPackSchema.parse(value) as ProofPack)
    .catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? undefined : Promise.reject(error));
  return {
    historical: true,
    ...(proof ? { proofId: proof.id } : {}),
    assessments: claims.map((claim) => assessClaim(claim, proof)),
  };
}
