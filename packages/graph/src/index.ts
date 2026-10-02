import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import { nowIso, stableId, writeJson, type GraphEdge, type GraphNode, type MindGraph, type ProjectConfig } from "../../core/src/index.ts";
import { parseProject } from "../../parser/src/index.ts";

function normalizeRel(path: string): string {
  return normalize(path).replaceAll("\\", "/").replace(/^\.\//, "");
}

function resolveImport(sourcePath: string, specifier: string, files: Map<string, GraphNode>): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = normalizeRel(join(dirname(sourcePath), specifier));
  const candidates = [
    base,
    ...[".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].map((extension) => `${base}${extension}`),
    ...["index.ts", "index.tsx", "index.js", "index.jsx"].map((index) => `${base}/${index}`),
  ];
  return candidates.find((candidate) => files.has(candidate));
}

async function packageNodes(root: string): Promise<GraphNode[]> {
  const packagePath = join(root, "package.json");
  if (!existsSync(packagePath)) return [];
  const pkg = JSON.parse(await readFile(packagePath, "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  return [...new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})])]
    .sort()
    .map((name) => ({ id: stableId("pkg", name), type: "PACKAGE" as const, name }));
}

export async function buildMindGraph(root: string, config: ProjectConfig): Promise<MindGraph> {
  const parsed = await parseProject(root, config.scanner.extensions, config.scanner.exclude);
  const packages = await packageNodes(root);
  const nodes = [...parsed.files, ...parsed.symbols, ...packages];
  const edges: GraphEdge[] = [];
  const fileByPath = new Map(parsed.files.filter((node) => node.path).map((node) => [node.path as string, node]));
  const packageByName = new Map(packages.map((node) => [node.name, node]));

  for (const symbol of parsed.symbols) {
    if (!symbol.path) continue;
    const file = fileByPath.get(symbol.path);
    if (!file) continue;
    edges.push({
      id: stableId("edge", `CONTAINS:${file.id}:${symbol.id}`),
      type: "CONTAINS",
      from: file.id,
      to: symbol.id,
    });
  }

  for (const item of parsed.imports) {
    const from = fileByPath.get(item.sourcePath);
    if (!from) continue;
    const targetFile = resolveImport(item.sourcePath, item.specifier, fileByPath);
    if (targetFile) {
      const to = fileByPath.get(targetFile);
      if (!to) continue;
      edges.push({
        id: stableId("edge", `IMPORTS:${from.id}:${to.id}`),
        type: "IMPORTS",
        from: from.id,
        to: to.id,
        metadata: { specifier: item.specifier },
      });
      continue;
    }
    const packageName = item.specifier.startsWith("@")
      ? item.specifier.split("/").slice(0, 2).join("/")
      : item.specifier.split("/")[0];
    if (!packageName) continue;
    const pkg = packageByName.get(packageName);
    if (pkg) {
      edges.push({
        id: stableId("edge", `DEPENDS_ON:${from.id}:${pkg.id}`),
        type: "DEPENDS_ON",
        from: from.id,
        to: pkg.id,
        metadata: { specifier: item.specifier },
      });
    }
  }

  const tests = parsed.files.filter((node) => node.type === "TEST" && node.path);
  for (const test of tests) {
    const stem = (test.path as string)
      .replace(/(?:^|\/)(?:test|tests|__tests__)\//g, "")
      .replace(/\.(?:test|spec)(?=\.)/, "")
      .replace(extname(test.path as string), "");
    const target = parsed.files.find((node) => node.type === "FILE" && node.path && normalizeRel(node.path).replace(extname(node.path), "").endsWith(stem));
    if (target) {
      edges.push({
        id: stableId("edge", `TESTED_BY:${target.id}:${test.id}`),
        type: "TESTED_BY",
        from: target.id,
        to: test.id,
      });
    }
  }

  return {
    version: 1,
    generatedAt: nowIso(),
    parser: "projectmind-regex-v0",
    nodes,
    edges,
  };
}

export async function persistMindGraph(root: string, graph: MindGraph): Promise<void> {
  await writeJson(join(root, ".projectmind", "graph.json"), graph);
}

export function graphStats(graph: MindGraph): Record<string, number> {
  const stats: Record<string, number> = { nodes: graph.nodes.length, edges: graph.edges.length };
  for (const node of graph.nodes) stats[node.type.toLowerCase()] = (stats[node.type.toLowerCase()] ?? 0) + 1;
  return stats;
}
