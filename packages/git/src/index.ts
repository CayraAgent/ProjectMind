import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ChangeSummary, MindGraph } from "../../core/src/index.ts";

const execFileAsync = promisify(execFile);

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args], { maxBuffer: 1024 * 1024 * 8 });
  return stdout.trim();
}

export async function isGitRepository(root: string): Promise<boolean> {
  try {
    return (await git(root, ["rev-parse", "--is-inside-work-tree"])) === "true";
  } catch {
    return false;
  }
}

export async function currentCommit(root: string): Promise<string | undefined> {
  try {
    return await git(root, ["rev-parse", "HEAD"]);
  } catch {
    return undefined;
  }
}

export async function changedFiles(root: string): Promise<string[]> {
  if (!(await isGitRepository(root))) return [];
  const outputs = await Promise.all([
    git(root, ["diff", "--name-only", "HEAD"]).catch(() => ""),
    git(root, ["diff", "--name-only", "--cached"]).catch(() => ""),
    git(root, ["ls-files", "--others", "--exclude-standard"]).catch(() => ""),
  ]);
  return [...new Set(outputs.flatMap((value) => value.split("\n").filter(Boolean)))].sort();
}

export async function summarizeChanges(root: string, graph: MindGraph): Promise<ChangeSummary> {
  const files = await changedFiles(root);
  const changedSet = new Set(files);
  const fileNodes = graph.nodes.filter((node) => node.path && (node.type === "FILE" || node.type === "TEST"));
  const changedFileNodeIds = new Set(fileNodes.filter((node) => changedSet.has(node.path as string)).map((node) => node.id));
  const changedSymbols = graph.nodes
    .filter((node) => node.path && (node.type === "FUNCTION" || node.type === "CLASS") && changedSet.has(node.path as string))
    .map((node) => ({ id: node.id, name: node.name, type: node.type, ...(node.path ? { path: node.path } : {}) }));

  const reverseAffected = new Set<string>();
  let expanded = true;
  const affectedNodeIds = new Set(changedFileNodeIds);
  while (expanded) {
    expanded = false;
    for (const edge of graph.edges) {
      if (edge.type !== "IMPORTS") continue;
      if (affectedNodeIds.has(edge.to) && !affectedNodeIds.has(edge.from)) {
        affectedNodeIds.add(edge.from);
        reverseAffected.add(edge.from);
        expanded = true;
      }
    }
  }

  const affectedFiles = fileNodes.filter((node) => reverseAffected.has(node.id)).flatMap((node) => (node.path ? [node.path] : []));
  const commit = await currentCommit(root);
  return { ...(commit ? { commit } : {}), files, changedSymbols, affectedFiles: [...new Set(affectedFiles)].sort() };
}
