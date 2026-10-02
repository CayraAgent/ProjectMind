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
    })),
    preserve,
    outOfScope,
  };
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
  return readJson<IntentContract>(join(projectMindDir(root), "intents", `${resolved}.json`));
}
