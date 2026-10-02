import { z } from "zod";
import { configSchema, verificationCommandSchema } from "../../core/src/schema.ts";
import type { ProjectConfig, VerificationCommand } from "../../core/src/index.ts";

export const PROVIDER_API_VERSION = "projectmind.provider/v1" as const;

const providerManifestSchema = z.object({
  apiVersion: z.literal(PROVIDER_API_VERSION),
  id: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/, "Provider id must be a reverse-domain-style lowercase identifier"),
  displayName: z.string().trim().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "Provider version must be SemVer"),
  capabilities: z.tuple([z.literal("verification-commands")]),
}).strict();

export interface ProviderManifestV1 {
  apiVersion: typeof PROVIDER_API_VERSION;
  id: string;
  displayName: string;
  version: string;
  capabilities: readonly ["verification-commands"];
}

export interface ProviderContextV1 {
  root: string;
  project: Readonly<ProjectConfig["project"]>;
}

export interface VerificationCommandProviderV1 {
  manifest: ProviderManifestV1;
  commands(context: Readonly<ProviderContextV1>): readonly VerificationCommand[] | Promise<readonly VerificationCommand[]>;
}

export function defineVerificationProvider(provider: VerificationCommandProviderV1): VerificationCommandProviderV1 {
  const manifest = providerManifestSchema.parse(provider.manifest) as ProviderManifestV1;
  if (typeof provider.commands !== "function") throw new Error("Provider commands must be a function.");
  return Object.freeze({ ...provider, manifest: Object.freeze({ ...manifest, capabilities: Object.freeze(["verification-commands"] as const) }) });
}

export async function resolveProviderCommands(provider: VerificationCommandProviderV1, context: ProviderContextV1): Promise<VerificationCommand[]> {
  const validated = defineVerificationProvider(provider);
  const output = await validated.commands(Object.freeze({ root: context.root, project: Object.freeze({ ...context.project }) }));
  if (!Array.isArray(output) || output.length === 0 || output.length > 32) throw new Error("A provider must return between 1 and 32 verification commands.");
  const commands = output.map((item) => verificationCommandSchema.parse(item) as VerificationCommand);
  if (new Set(commands.map((item) => item.command)).size !== commands.length) throw new Error("Provider returned duplicate commands.");
  return commands;
}

export async function mergeProviderCommands(provider: VerificationCommandProviderV1, context: ProviderContextV1, config: ProjectConfig): Promise<ProjectConfig> {
  const commands = await resolveProviderCommands(provider, context);
  return configSchema.parse({ ...config, verification: { commands: [...config.verification.commands, ...commands] } }) as ProjectConfig;
}

/** @deprecated Use defineVerificationProvider. The pre-v1 EvidenceRecord-producing placeholder was intentionally removed. */
export const defineEvidenceProvider = defineVerificationProvider;
