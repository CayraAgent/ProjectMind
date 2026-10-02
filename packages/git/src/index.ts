import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { lstat, readFile, readlink, readdir, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ChangeSummary, MindGraph } from "../../core/src/index.ts";
import { parseSourceContent } from "../../parser/src/index.ts";

const execFileAsync = promisify(execFile);

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args], { maxBuffer: 8 * 1024 * 1024 });
  return stdout;
}

export async function isGitRepository(root: string): Promise<boolean> {
  try { return (await git(root, ["rev-parse", "--is-inside-work-tree"])).trim() === "true"; }
  catch { return false; }
}

export async function currentCommit(root: string): Promise<string | undefined> {
  try { return (await git(root, ["rev-parse", "--verify", "HEAD"])).trim(); }
  catch { return undefined; }
}

export function isDerivedState(path: string): boolean {
  return /^\.projectmind\/(?:evidence\/|proofs\/|cache\/|runtime\/|graph\.json$|latest-proof\.json$)/.test(path);
}

export async function repositoryState(root: string): Promise<string> {
  const [gitRoot, requestedRoot] = await Promise.all([
    realpath(resolve((await git(root, ["rev-parse", "--show-toplevel"])).trim())),
    realpath(resolve(root)),
  ]);
  if (gitRoot !== requestedRoot) {
    throw new Error("Run ProjectMind from the Git repository root.");
  }
  const commit = await currentCommit(root);
  if (!commit) throw new Error("Verification requires a Git repository with an initial commit.");
  const paths = [...new Set((await git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]))
    .split("\0").filter((path) => path && !isDerivedState(path)))].sort();
  const hash = createHash("sha256").update(commit);
  for (const path of paths) {
    hash.update(JSON.stringify(path));
    try {
      const stat = await lstat(join(root, path));
      hash.update(String(stat.mode));
      if (stat.isSymbolicLink()) hash.update(await readlink(join(root, path)));
      else if (stat.isFile()) hash.update(await readFile(join(root, path)));
      else throw new Error(`Unsupported repository entry: ${path}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      hash.update("deleted");
    }
  }
  // Include reviewable intent/config even if .projectmind is gitignored.
  const intents = await readdir(join(root, ".projectmind/intents")).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return [];
  });
  for (const path of [".projectmind/config.json", ".projectmind/constitution.json", ".projectmind/current-intent.json", ...intents.sort().map((name) => `.projectmind/intents/${name}`)]) {
    hash.update(path);
    try { hash.update(await readFile(join(root, path))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return hash.digest("hex");
}

export async function changedFiles(root: string, base?: string): Promise<string[]> {
  if (!(await isGitRepository(root))) return [];
  const resolvedBase = base ? (await git(root, ["rev-parse", "--verify", "--end-of-options", `${base}^{commit}`])).trim() : "HEAD";
  const outputs = await Promise.all([
    git(root, ["diff", "--name-only", "-z", resolvedBase, "--"]).catch((error: unknown) => {
      if (base) throw error;
      return "";
    }),
    git(root, ["diff", "--name-only", "-z", "--cached"]),
    git(root, ["ls-files", "-z", "--others", "--exclude-standard"]),
  ]);
  return [...new Set(outputs.flatMap((value) => value.split("\0").filter((path) => path && !isDerivedState(path))))].sort();
}

async function baseCommit(root: string, base?: string): Promise<string> {
  return base ? (await git(root, ["rev-parse", "--verify", "--end-of-options", `${base}^{commit}`])).trim() : "HEAD";
}

async function sourceAt(root: string, commit: string, path: string): Promise<string | undefined> {
  try { return await git(root, ["show", `${commit}:${path}`]); }
  catch { return undefined; }
}

function symbolKey(symbol: { name: string; type: string; path?: string }): string {
  return `${symbol.path ?? ""}\0${symbol.type}\0${symbol.name}`;
}

export async function summarizeChanges(root: string, graph: MindGraph, base?: string): Promise<ChangeSummary> {
  const files = await changedFiles(root, base);
  const changedSet = new Set(files);
  const fileNodes = graph.nodes.filter((node) => node.path && (node.type === "FILE" || node.type === "TEST"));
  const affectedNodeIds = new Set(fileNodes.filter((node) => changedSet.has(node.path as string)).map((node) => node.id));
  // Conservative file-level impact, not a statement-level semantic diff.
  const changedSymbols = graph.nodes
    .filter((node) => node.path && ["FUNCTION", "CLASS"].includes(node.type) && changedSet.has(node.path))
    .map((node) => ({ id: node.id, name: node.name, type: node.type, ...(node.path ? { path: node.path } : {}) }));
  const currentSymbolCounts = new Map<string, number>();
  for (const symbol of graph.nodes.filter((node) => node.path)) {
    const key = symbolKey(symbol);
    currentSymbolCounts.set(key, (currentSymbolCounts.get(key) ?? 0) + 1);
  }
  const comparisonCommit = await baseCommit(root, base);
  const deletedSymbols = (await Promise.all(files.map(async (path) => {
    const source = await sourceAt(root, comparisonCommit, path);
    if (source === undefined) return [];
    try { return parseSourceContent(path, path, source).symbols; }
    catch { return []; }
  }))).flat()
    .filter((symbol) => {
      const key = symbolKey(symbol);
      const remaining = currentSymbolCounts.get(key) ?? 0;
      if (remaining === 0) return true;
      currentSymbolCounts.set(key, remaining - 1);
      return false;
    })
    .map((symbol) => ({ id: symbol.id, name: symbol.name, type: symbol.type, ...(symbol.path ? { path: symbol.path } : {}) }))
    .sort((a, b) => (a.path ?? "").localeCompare(b.path ?? "") || a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  const reverseAffected = new Set<string>();
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const edge of graph.edges) {
      if (edge.type === "IMPORTS" && affectedNodeIds.has(edge.to) && !affectedNodeIds.has(edge.from)) {
        affectedNodeIds.add(edge.from);
        reverseAffected.add(edge.from);
        expanded = true;
      }
    }
  }
  const affectedFiles = fileNodes.filter((node) => reverseAffected.has(node.id)).flatMap((node) => node.path ? [node.path] : []);
  const commit = await currentCommit(root);
  return { ...(commit ? { commit } : {}), files, changedSymbols, deletedSymbols, affectedFiles: [...new Set(affectedFiles)].sort() };
}
