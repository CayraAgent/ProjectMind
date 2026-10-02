import { nowIso, type EvidenceRecord, type IntentContract, type ProjectConfig, type VerificationResult } from "../../core/src/index.ts";

export function verifyIntent(config: ProjectConfig, intent: IntentContract, evidence: EvidenceRecord[]): VerificationResult {
  const requiredCommandResults: VerificationResult["requiredCommandResults"] = [];
  const reasons: string[] = [];

  for (const command of config.verification.commands.filter((item) => item.required)) {
    const record = [...evidence].reverse().find((item) => item.kind === command.kind && item.command === command.command);
    if (!record) {
      requiredCommandResults.push({ kind: command.kind, status: "MISSING" });
      reasons.push(`Required ${command.kind} evidence is missing.`);
    } else if (record.exitCode !== 0) {
      requiredCommandResults.push({ kind: command.kind, status: "FAIL", evidenceId: record.id });
      reasons.push(`Required ${command.kind} command failed.`);
    } else {
      requiredCommandResults.push({ kind: command.kind, status: "PASS", evidenceId: record.id });
    }
  }

  const requirements = intent.requirements.map((requirement) => {
    const matching = evidence.filter((record) => requirement.evidenceKinds.includes(record.kind));
    const passing = matching.filter((record) => record.exitCode === 0);
    const failing = matching.filter((record) => record.exitCode !== 0);
    if (failing.length) {
      reasons.push(`${requirement.id} has failing evidence.`);
      return { requirementId: requirement.id, status: "FAILED" as const, evidenceIds: failing.map((record) => record.id), reason: "One or more required evidence commands failed." };
    }
    const coveredKinds = new Set(passing.map((record) => record.kind));
    const missingKinds = requirement.evidenceKinds.filter((kind) => !coveredKinds.has(kind));
    if (missingKinds.length) {
      reasons.push(`${requirement.id} lacks ${missingKinds.join(", ")} evidence.`);
      return { requirementId: requirement.id, status: "UNVERIFIED" as const, evidenceIds: passing.map((record) => record.id), reason: `Missing evidence kinds: ${missingKinds.join(", ")}` };
    }
    return { requirementId: requirement.id, status: "VERIFIED" as const, evidenceIds: passing.map((record) => record.id) };
  });

  const commandFailure = requiredCommandResults.some((result) => result.status !== "PASS");
  const criticalFailure = requirements.some((result) => result.status !== "VERIFIED");
  const status = commandFailure || criticalFailure ? "NOT_VERIFIED" : "VERIFIED";

  return {
    version: 1,
    status,
    intentId: intent.id,
    generatedAt: nowIso(),
    requiredCommandResults,
    requirements,
    reasons,
  };
}
