import { z } from "zod";

export const evidenceKindSchema = z.enum(["test", "build", "typecheck", "lint", "static", "runtime", "command"]);
export const evidenceProviderSchema = z.enum(["generic-command", "node-test-junit", "pytest-junit"]);
export const intentIdSchema = z.string().regex(/^PM-\d{4,}$/, "Invalid intent id");
const nonempty = z.string().trim().min(1);
export const verificationCommandSchema = z.object({
  kind: evidenceKindSchema, command: nonempty, required: z.boolean(), timeoutMs: z.number().int().min(1).max(600_000).optional(),
  provider: evidenceProviderSchema.optional(),
}).strict().superRefine((item, context) => {
  if ((item.provider === "node-test-junit" || item.provider === "pytest-junit") && item.kind !== "test") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Structured JUnit providers are only valid for test evidence" });
  }
});
export const configSchema = z.object({
  version: z.literal(1),
  project: z.object({ name: nonempty, root: z.literal("."), packageManager: z.string().optional() }).strict(),
  scanner: z.object({ include: z.array(nonempty).min(1), extensions: z.array(nonempty), exclude: z.array(nonempty) }).strict(),
  verification: z.object({ commands: z.array(verificationCommandSchema)
    .refine((items) => new Set(items.map((item) => item.command)).size === items.length, "Duplicate commands") }).strict(),
}).strict();
const pathPrefixSchema = nonempty.refine((value) => !value.startsWith("/") && !value.includes("\\")
  && !value.split("/").includes("..") && !/[*?]/.test(value), "Path prefixes must be normalized repository-relative paths");
export const constitutionSchema = z.object({
  version: z.literal(1),
  dependencyRules: z.array(z.object({
    id: nonempty,
    from: pathPrefixSchema,
    cannotImport: pathPrefixSchema,
  }).strict()).refine((items) => new Set(items.map((item) => item.id)).size === items.length, "Duplicate dependency rule ids"),
  sensitivePaths: z.array(z.object({
    id: nonempty,
    prefix: pathPrefixSchema,
    requiredEvidenceKinds: z.array(evidenceKindSchema).min(1),
  }).strict()).refine((items) => new Set(items.map((item) => item.id)).size === items.length, "Duplicate sensitive path rule ids"),
}).strict();
export const requirementSchema = z.object({
  id: z.string().regex(/^REQ-\d+$/), statement: nonempty, critical: z.boolean(),
  evidenceKinds: z.array(evidenceKindSchema).min(1), evidenceCommands: z.array(nonempty).optional(),
  evidenceTests: z.array(nonempty).optional(),
}).strict();
export const intentSchema = z.object({
  version: z.literal(1), id: intentIdSchema, title: nonempty, createdAt: z.string().datetime(),
  requirements: z.array(requirementSchema).min(1).refine((items) => new Set(items.map((item) => item.id)).size === items.length, "Duplicate requirements"),
  preserve: z.array(nonempty), outOfScope: z.array(nonempty),
}).strict();

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const gitCommitSchema = z.string().regex(/^[a-f0-9]{40,64}$/);
const testCaseSchema = z.object({
  id: z.string().regex(/^test_[a-f0-9]{24}$/),
  name: nonempty,
  classname: nonempty.optional(),
  file: nonempty.optional(),
  status: z.enum(["passed", "failed", "skipped"]),
  durationMs: z.number().nonnegative().finite().optional(),
}).strict();
const testSummarySchema = z.object({
  provider: z.enum(["node-test-junit", "pytest-junit"]),
  discovered: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  cases: z.array(testCaseSchema),
}).strict().superRefine((summary, context) => {
  if (summary.discovered !== summary.cases.length || summary.discovered !== summary.passed + summary.failed + summary.skipped) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Test summary counts are inconsistent" });
  }
});
export const evidenceRecordSchema = z.object({
  version: z.literal(1),
  id: z.string().regex(/^ev_[a-f0-9]{24}$/),
  kind: evidenceKindSchema,
  command: nonempty.optional(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
  commit: gitCommitSchema.optional(),
  runId: nonempty.optional(),
  repositoryState: sha256Schema.optional(),
  repositoryStateAfter: sha256Schema.optional(),
  termination: z.enum(["timeout", "output-limit", "spawn-error"]).optional(),
  provider: evidenceProviderSchema.optional(),
  testSummary: testSummarySchema.optional(),
  evidenceError: nonempty.optional(),
}).strict();
export const claimRecordSchema = z.object({
  version: z.literal(1).default(1),
  id: z.string().regex(/^claim_[a-f0-9]{24}$/),
  text: nonempty.max(10_000),
  createdAt: z.string().datetime(),
  status: z.literal("UNPROVEN"),
  evidenceIds: z.array(z.string().regex(/^ev_[a-f0-9]{24}$/)).default([]),
  intentId: intentIdSchema.optional(),
  requirementId: z.string().regex(/^REQ-\d+$/).optional(),
}).strict().superRefine((claim, context) => {
  if (claim.requirementId && !claim.intentId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "A requirement claim binding also requires an intent id" });
  }
  if (new Set(claim.evidenceIds).size !== claim.evidenceIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate claim evidence ids" });
  }
});
const requirementVerificationSchema = z.object({
  requirementId: z.string().regex(/^REQ-\d+$/),
  status: z.enum(["VERIFIED", "UNVERIFIED", "FAILED"]),
  evidenceIds: z.array(z.string().regex(/^ev_[a-f0-9]{24}$/)),
  reason: nonempty.optional(),
}).strict();
export const verificationResultSchema = z.object({
  version: z.literal(1),
  status: z.enum(["VERIFIED", "PARTIALLY_VERIFIED", "NOT_VERIFIED", "BLOCKED"]),
  intentId: intentIdSchema,
  generatedAt: z.string().datetime(),
  requiredCommandResults: z.array(z.object({
    kind: evidenceKindSchema,
    status: z.enum(["PASS", "FAIL", "MISSING"]),
    evidenceId: z.string().regex(/^ev_[a-f0-9]{24}$/).optional(),
  }).strict()),
  requirements: z.array(requirementVerificationSchema),
  reasons: z.array(nonempty),
  repositoryState: sha256Schema.optional(),
}).strict();
const changeSummarySchema = z.object({
  commit: gitCommitSchema.optional(),
  files: z.array(z.string()),
  changedSymbols: z.array(z.object({
    id: nonempty,
    name: nonempty,
    type: z.enum(["FILE", "MODULE", "FUNCTION", "CLASS", "TEST", "PACKAGE"]),
    path: nonempty.optional(),
  }).strict()),
  deletedSymbols: z.array(z.object({
    id: nonempty,
    name: nonempty,
    type: z.enum(["FILE", "MODULE", "FUNCTION", "CLASS", "TEST", "PACKAGE"]),
    path: nonempty.optional(),
  }).strict()).optional(),
  affectedFiles: z.array(z.string()),
}).strict();
export const proofPackSchema = z.object({
  version: z.literal(1),
  projectMindVersion: nonempty,
  scope: z.literal("declared-command-checks"),
  id: z.string().regex(/^proof_[a-f0-9]{24}$/),
  createdAt: z.string().datetime(),
  project: nonempty,
  commit: gitCommitSchema.optional(),
  intent: intentSchema,
  change: changeSummarySchema,
  evidence: z.array(evidenceRecordSchema),
  verification: verificationResultSchema,
}).strict().superRefine((proof, context) => {
  if (proof.verification.intentId !== proof.intent.id) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Verification intent does not match ProofPack intent" });
  }
  const evidenceIds = new Set(proof.evidence.map((item) => item.id));
  if (proof.commit && proof.change.commit && proof.commit !== proof.change.commit) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "ProofPack commit does not match change commit" });
  }
  for (const command of proof.verification.requiredCommandResults) {
    if (command.evidenceId && !evidenceIds.has(command.evidenceId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Required command references unknown evidence" });
    }
  }
  const verifiedRequirementIds = proof.verification.requirements.map((item) => item.requirementId);
  if (new Set(verifiedRequirementIds).size !== verifiedRequirementIds.length
    || proof.intent.requirements.some((item) => !verifiedRequirementIds.includes(item.id))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Verification requirement coverage is incomplete or duplicated" });
  }
  for (const requirement of proof.verification.requirements) {
    if (!proof.intent.requirements.some((item) => item.id === requirement.requirementId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown requirement ${requirement.requirementId}` });
    }
    if (requirement.evidenceIds.some((id) => !evidenceIds.has(id))) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown evidence reference in ${requirement.requirementId}` });
    }
  }
  if (proof.verification.status === "VERIFIED") {
    if (proof.verification.reasons.length
      || proof.verification.requiredCommandResults.some((item) => item.status !== "PASS")
      || proof.verification.requirements.some((item) => item.status !== "VERIFIED")) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "VERIFIED ProofPack contains a non-passing result" });
    }
    const state = proof.verification.repositoryState;
    const runIds = new Set(proof.evidence.map((item) => item.runId));
    if (!state || runIds.size !== 1 || proof.evidence.some((item) => item.repositoryState !== state || item.repositoryStateAfter !== state)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "VERIFIED ProofPack evidence is not one fresh repository-state run" });
    }
  }
});
