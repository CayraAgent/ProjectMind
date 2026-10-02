import test from "node:test";
import assert from "node:assert/strict";
import { assessClaim } from "../packages/claims/src/index.ts";
import { claimRecordSchema } from "../packages/core/src/schema.ts";
import type { ClaimRecord, ProofPack } from "../packages/core/src/index.ts";

const evidenceId = "ev_aaaaaaaaaaaaaaaaaaaaaaaa";
const claim: ClaimRecord = {
  version: 1,
  id: "claim_bbbbbbbbbbbbbbbbbbbbbbbb",
  text: "Login behavior is covered",
  createdAt: "2026-01-01T00:00:00.000Z",
  status: "UNPROVEN",
  evidenceIds: [evidenceId],
  intentId: "PM-1000",
  requirementId: "REQ-1",
};

const proof = {
  id: "proof_cccccccccccccccccccccccc",
  intent: { id: "PM-1000" },
  evidence: [{
    id: evidenceId,
    exitCode: 0,
    repositoryState: "d".repeat(64),
    repositoryStateAfter: "d".repeat(64),
  }],
  verification: {
    repositoryState: "d".repeat(64),
    requirements: [{ requirementId: "REQ-1", status: "VERIFIED", evidenceIds: [evidenceId] }],
  },
} as ProofPack;

test("claim strength reports explicit historical linkage without changing claim status", () => {
  const assessed = assessClaim(claim, proof);
  assert.equal(assessed.strength, "VERIFIED_REQUIREMENT_LINKED");
  assert.equal(assessed.claim.status, "UNPROVEN");
});

test("stale or absent evidence cannot strengthen a claim", () => {
  const stale = structuredClone(proof);
  stale.evidence[0]!.repositoryStateAfter = "e".repeat(64);
  assert.equal(assessClaim(claim, stale).strength, "DECLARED_ONLY");
  assert.equal(assessClaim({ ...claim, evidenceIds: [] }, proof).strength, "DECLARED_ONLY");
});

test("passing evidence without a verified requirement remains evidence-linked", () => {
  assert.equal(assessClaim({ ...claim, requirementId: "REQ-2" }, proof).strength, "EVIDENCE_LINKED");
});

test("legacy UNPROVEN claim records receive safe declared-only defaults", () => {
  const legacy = claimRecordSchema.parse({
    id: claim.id,
    text: claim.text,
    createdAt: claim.createdAt,
    status: "UNPROVEN",
  }) as ClaimRecord;
  assert.equal(legacy.version, 1);
  assert.deepEqual(legacy.evidenceIds, []);
  assert.equal(assessClaim(legacy, proof).strength, "DECLARED_ONLY");
});
