import { intentSchema, intentIdSchema } from "../../core/src/schema.ts";
import { loadConfig } from "../../core/src/project.ts";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { nowIso, projectMindDir, readJson, writeJson, type EvidenceKind, type IntentContract } from "../../core/src/index.ts";

async function nextId(root: string): Promise<string> {
  const dir = join(projectMindDir(root), "intents");
  try {
    const files = (await readdir(dir)).filter((name) => /^PM-\d{4}\.json$/.test(name));
    const max = files.reduce((value, name) => Math.max(value, Number(name.slice(3, 7))), 0);
    return `PM-${String(max + 1).padStart(4, "0")}`;
  } catch {
    return "PM-0001";
  }
}

export async function createIntent(
  root: string,
  title: string,
  requirements: string[],
  preserve: string[],
  outOfScope: string[],
  defaultEvidenceKinds: EvidenceKind[] = ["test"],
): Promise<IntentContract> {
  const id = await nextId(root);
  const statements = requirements.length ? requirements : [title];
  const intent: IntentContract = {
    version: 1,
    id,
    title,
    createdAt: nowIso(),
    requirements: statements.map((statement, index) => ({
      id: `REQ-${index + 1}`,
      statement,
      critical: true,
      evidenceKinds: defaultEvidenceKinds,
      evidenceCommands: [],
    })),
    preserve,
    outOfScope,
  };
  intentSchema.parse(intent);
  await writeJson(join(projectMindDir(root), "intents", `${id}.json`), intent);
  await writeJson(join(projectMindDir(root), "current-intent.json"), { id });
  return intent;
}

export async function loadIntent(root: string, id?: string): Promise<IntentContract> {
  let resolved = id;
  if (!resolved) {
    const current = await readJson<{ id: string }>(join(projectMindDir(root), "current-intent.json"));
    resolved = current.id;
  }
  intentIdSchema.parse(resolved);
  return intentSchema.parse(await readJson(join(projectMindDir(root), "intents", `${resolved}.json`))) as IntentContract;
}

export async function bindRequirement(
  root: string,
  requirementId: string,
  command: string,
  id?: string,
  testNames: string[] = [],
): Promise<IntentContract> {
  const config = await loadConfig(root);
  const registered = config.verification.commands.find((item) => item.command === command);
  if (!registered) throw new Error("Command must be declared in .projectmind/config.json before binding.");
  const intent = await loadIntent(root, id);
  const requirement = intent.requirements.find((item) => item.id === requirementId);
  if (!requirement) throw new Error("Unknown requirement id.");
  if (registered.kind === "test" && registered.provider !== "node-test-junit" && registered.provider !== "pytest-junit") {
    throw new Error("Test requirements require a structured test provider.");
  }
  if ((registered.provider === "node-test-junit" || registered.provider === "pytest-junit") && !testNames.length) {
    throw new Error("Bind at least one exact test name with --test.");
  }
  requirement.evidenceCommands = [...new Set([...(requirement.evidenceCommands ?? []), command])];
  requirement.evidenceTests = [...new Set([...(requirement.evidenceTests ?? []), ...testNames])];
  intentSchema.parse(intent);
  await writeJson(join(projectMindDir(root), "intents", `${intent.id}.json`), intent);
  return intent;
}
