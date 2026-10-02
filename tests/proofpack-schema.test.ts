import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Ajv } from "ajv";
import { validateProofPack } from "../packages/proofpack/src/index.ts";

async function fixture(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(new URL("../fixtures/proofpack-v1/valid.json", import.meta.url), "utf8")) as Record<string, unknown>;
}

test("checked-in ProofPack v1 fixture passes runtime and public JSON schemas", async () => {
  const proof = await fixture();
  assert.equal(validateProofPack(proof).id, "proof_111111111111111111111111");
  const schema = JSON.parse(await readFile(new URL("../schemas/proofpack-v1.schema.json", import.meta.url), "utf8"));
  const ajv = new Ajv({ strict: true, formats: { "date-time": true } });
  const validate = ajv.compile(schema);
  assert.equal(validate(proof), true, JSON.stringify(validate.errors));
});

test("runtime schema rejects incompatible version, missing scope, and malformed ids", async () => {
  const proof = await fixture();
  assert.throws(() => validateProofPack({ ...proof, version: 2 }));
  const { scope: _scope, ...withoutScope } = proof;
  assert.throws(() => validateProofPack(withoutScope));
  assert.throws(() => validateProofPack({ ...proof, id: "proof-forged" }));
});

test("runtime schema checks cross-object intent and evidence references", async () => {
  const proof = await fixture();
  const verification = proof.verification as Record<string, unknown>;
  assert.throws(() => validateProofPack({ ...proof, verification: { ...verification, intentId: "PM-9999" } }));
  const requirements = verification.requirements as Array<Record<string, unknown>>;
  assert.throws(() => validateProofPack({
    ...proof,
    verification: { ...verification, requirements: [{ ...requirements[0], evidenceIds: ["ev_222222222222222222222222"] }] },
  }));
  assert.throws(() => validateProofPack({
    ...proof,
    verification: {
      ...verification,
      requiredCommandResults: [{ kind: "test", status: "PASS", evidenceId: "ev_222222222222222222222222" }],
    },
  }));
});

test("test summary counts must match the embedded cases", async () => {
  const proof = await fixture();
  const evidence = proof.evidence as Array<Record<string, unknown>>;
  const summary = evidence[0]?.testSummary as Record<string, unknown>;
  assert.throws(() => validateProofPack({
    ...proof,
    evidence: [{ ...evidence[0], testSummary: { ...summary, discovered: 2 } }],
  }));
});

test("a VERIFIED ProofPack must contain one fresh passing run and complete requirement coverage", async () => {
  const proof = await fixture();
  const verification = proof.verification as Record<string, unknown>;
  assert.throws(() => validateProofPack({ ...proof, verification: { ...verification, reasons: ["contradiction"] } }));
  assert.throws(() => validateProofPack({ ...proof, verification: { ...verification, requirements: [] } }));
  const evidence = proof.evidence as Array<Record<string, unknown>>;
  assert.throws(() => validateProofPack({ ...proof, evidence: [{ ...evidence[0], repositoryStateAfter: "b".repeat(64) }] }));
  const change = proof.change as Record<string, unknown>;
  assert.throws(() => validateProofPack({ ...proof, change: { ...change, commit: "2".repeat(40) } }));
});
