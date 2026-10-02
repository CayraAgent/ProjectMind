import { z } from "zod";

const evidenceKind = z.enum(["test", "build", "typecheck", "lint", "static", "runtime", "command"]);
const evidenceProvider = z.enum(["generic-command", "node-test-junit"]);
export const intentIdSchema = z.string().regex(/^PM-\d{4,}$/, "Invalid intent id");
const nonempty = z.string().trim().min(1);
export const configSchema = z.object({
  version: z.literal(1),
  project: z.object({ name: nonempty, root: z.literal("."), packageManager: z.string().optional() }).strict(),
  scanner: z.object({ include: z.array(nonempty).min(1), extensions: z.array(nonempty), exclude: z.array(nonempty) }).strict(),
  verification: z.object({ commands: z.array(z.object({
    kind: evidenceKind, command: nonempty, required: z.boolean(), timeoutMs: z.number().int().min(1).max(600_000).optional(),
    provider: evidenceProvider.optional(),
  }).strict().superRefine((item, context) => {
    if (item.provider === "node-test-junit" && item.kind !== "test") {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "node-test-junit is only valid for test evidence" });
    }
  })).refine((items) => new Set(items.map((item) => item.command)).size === items.length, "Duplicate commands") }).strict(),
}).strict();
export const intentSchema = z.object({
  version: z.literal(1), id: intentIdSchema, title: nonempty, createdAt: z.string().datetime(),
  requirements: z.array(z.object({
    id: z.string().regex(/^REQ-\d+$/), statement: nonempty, critical: z.boolean(),
    evidenceKinds: z.array(evidenceKind).min(1), evidenceCommands: z.array(nonempty).optional(),
    evidenceTests: z.array(nonempty).optional(),
  }).strict()).min(1).refine((items) => new Set(items.map((item) => item.id)).size === items.length, "Duplicate requirements"),
  preserve: z.array(nonempty), outOfScope: z.array(nonempty),
}).strict();
