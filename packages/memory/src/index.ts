import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { nowIso, projectMindDir, stableId, writeJson } from "../../core/src/index.ts";

export type MemoryType = "decision" | "constraint" | "incident";
export interface MemoryRecord { version: 1; id: string; type: MemoryType; text: string; createdAt: string; status: "ACTIVE"; }
export interface MemorySearchResult { item: MemoryRecord; score: number; matchedTerms: string[]; }
export interface MemorySearchOptions { type?: MemoryType; limit?: number; }

const memoryRecordSchema = z.object({
  version: z.literal(1).default(1),
  id: z.string().regex(/^mem_[a-f0-9]{24}$/),
  type: z.enum(["decision", "constraint", "incident"]),
  text: z.string().trim().min(1).max(10_000),
  createdAt: z.string().datetime(),
  status: z.literal("ACTIVE"),
}).strict();

const terms = (value: string): string[] => [...new Set(value.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+/gu) ?? [])];

export async function recordMemory(root: string, type: MemoryType, text: string): Promise<MemoryRecord> {
  const createdAt = nowIso();
  const item: MemoryRecord = { version: 1, id: stableId("mem", `${type}:${text}:${createdAt}`), type, text, createdAt, status: "ACTIVE" };
  await writeJson(join(projectMindDir(root), "memory", `${item.id}.json`), item);
  return item;
}

export async function searchMemory(root: string, query: string, options: MemorySearchOptions = {}): Promise<MemorySearchResult[]> {
  const queryTerms = terms(query);
  if (queryTerms.length === 0) throw new Error("Memory search query must contain a letter or number.");
  const limit = options.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("Memory search limit must be an integer from 1 to 50.");
  const directory = join(projectMindDir(root), "memory");
  const names = (await readdir(directory)).filter((name) => /^mem_[a-f0-9]{24}\.json$/.test(name)).sort();
  const records: MemoryRecord[] = [];
  for (const name of names) {
    const raw = JSON.parse(await readFile(join(directory, name), "utf8")) as unknown;
    const parsed = memoryRecordSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`Invalid memory record ${name}: ${parsed.error.issues[0]?.message ?? "schema mismatch"}`);
    records.push(parsed.data);
  }
  const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
  return records
    .filter((item) => !options.type || item.type === options.type)
    .map((item) => {
      const normalizedText = item.text.toLocaleLowerCase("en-US");
      const textTerms = new Set(terms(item.text));
      const matchedTerms = queryTerms.filter((term) => textTerms.has(term));
      const score = matchedTerms.length * 10 + (normalizedText.includes(normalizedQuery) ? 100 : 0);
      return { item, score, matchedTerms };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || right.item.createdAt.localeCompare(left.item.createdAt) || left.item.id.localeCompare(right.item.id))
    .slice(0, limit);
}
