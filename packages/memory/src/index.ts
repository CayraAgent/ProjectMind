import { join } from "node:path";
import { nowIso, projectMindDir, stableId, writeJson } from "../../core/src/index.ts";

export type MemoryType = "decision" | "constraint" | "incident";

export async function recordMemory(root: string, type: MemoryType, text: string): Promise<{ id: string; type: MemoryType; text: string; createdAt: string; status: "ACTIVE" }> {
  const createdAt = nowIso();
  const item = { id: stableId("mem", `${type}:${text}:${createdAt}`), type, text, createdAt, status: "ACTIVE" as const };
  await writeJson(join(projectMindDir(root), "memory", `${item.id}.json`), item);
  return item;
}
