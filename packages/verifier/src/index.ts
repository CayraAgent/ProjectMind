import { nowIso, type EvidenceRecord, type IntentContract, type ProjectConfig, type VerificationResult } from "../../core/src/index.ts";

export function verifyIntent(config: ProjectConfig, intent: IntentContract, evidence: EvidenceRecord[], state?: string): VerificationResult {
  const reasons: string[] = [];
  const fresh = evidence.filter((item) => state && item.repositoryState === state && item.repositoryStateAfter === state && item.runId);
  if (!state) reasons.push("Repository state is missing.");
  if (evidence.some((item) => !fresh.includes(item))) reasons.push("Evidence is stale or the repository changed during execution.");
  if (new Set(fresh.map((item) => item.runId)).size > 1) reasons.push("Evidence from different runs cannot be combined.");
  if (!intent.requirements.length) reasons.push("Intent has no requirements.");
  if (!config.verification.commands.some((item) => item.required)) reasons.push("At least one required command must be configured.");

  const latest = (command: string) => [...fresh].reverse().find((item) => item.command === command);
  const commandPasses = (record: EvidenceRecord | undefined, command: ProjectConfig["verification"]["commands"][number]): boolean => {
    if (!record || record.kind !== command.kind || record.exitCode !== 0 || Boolean(record.termination) || Boolean(record.evidenceError)) return false;
    if (command.provider === "node-test-junit" || command.provider === "pytest-junit") {
      return record.provider === command.provider
        && Boolean(record.testSummary)
        && (record.testSummary?.discovered ?? 0) > 0
        && (record.testSummary?.passed ?? 0) > 0
        && record.testSummary?.failed === 0;
    }
    return true;
  };
  const requiredCommandResults: VerificationResult["requiredCommandResults"] = config.verification.commands
    .filter((item) => item.required).map((command) => {
      const record = latest(command.command);
      const status = !record || record.kind !== command.kind ? "MISSING" : commandPasses(record, command) ? "PASS" : "FAIL";
      if (status !== "PASS") reasons.push(`Required ${command.kind} command ${status.toLowerCase()}: ${command.command}`);
      return { kind: command.kind, status, ...(record ? { evidenceId: record.id } : {}) };
    });

  const requirements = intent.requirements.map((requirement) => {
    const bindings = requirement.evidenceCommands ?? [];
    const records = bindings.map((command) => latest(command));
    const evidenceIds = records.flatMap((item) => item ? [item.id] : []);
    const registered = bindings.every((command) => config.verification.commands.some((item) => item.command === command));
    const coveredKinds = new Set(records.flatMap((item) => item ? [item.kind] : []));
    const declaredCommands = bindings.map((command) => config.verification.commands.find((item) => item.command === command));
    const failed = records.some((item, index) => item && declaredCommands[index] && !commandPasses(item, declaredCommands[index]));
    const requiresTests = requirement.evidenceKinds.includes("test");
    const testNames = requirement.evidenceTests ?? [];
    const structuredTestRecords = records.filter((item): item is EvidenceRecord & { testSummary: NonNullable<EvidenceRecord["testSummary"]> } => (item?.provider === "node-test-junit" || item?.provider === "pytest-junit") && Boolean(item.testSummary));
    const testMatches = testNames.map((name) => structuredTestRecords.flatMap((record) => record.testSummary.cases.filter((item) => item.name === name)));
    const invalidTestBinding = requiresTests && (
      !testNames.length
      || structuredTestRecords.length !== records.length
      || testMatches.some((matches) => matches.length !== 1 || matches[0]?.status !== "passed")
    );
    const missing = !bindings.length || !requirement.evidenceKinds.length || !registered || records.some((item) => !item)
      || requirement.evidenceKinds.some((kind) => !coveredKinds.has(kind))
      || records.some((item) => item && !config.verification.commands.some((command) => command.command === item.command && command.kind === item.kind))
      || invalidTestBinding;
    const status = failed ? "FAILED" : missing ? "UNVERIFIED" : "VERIFIED";
    if (status !== "VERIFIED") reasons.push(`${requirement.id}: ${failed ? "bound evidence failed" : invalidTestBinding ? "structured test binding is missing, ambiguous, skipped, or failed" : "missing explicit, fresh command evidence"}.`);
    return { requirementId: requirement.id, status: status as "VERIFIED" | "UNVERIFIED" | "FAILED", evidenceIds };
  });
  return {
    version: 1, status: reasons.length ? "NOT_VERIFIED" : "VERIFIED", intentId: intent.id,
    generatedAt: nowIso(), requiredCommandResults, requirements, reasons,
    ...(state ? { repositoryState: state } : {}),
  };
}
