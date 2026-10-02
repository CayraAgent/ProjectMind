import { builtinModules } from "node:module";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import ts from "typescript";
import { nowIso, stableId, writeJson, type GraphEdge, type GraphNode, type MindGraph, type ProjectConfig, type UnresolvedImport } from "../../core/src/index.ts";
import { parseProject } from "../../parser/src/index.ts";

function normalizeRel(path: string): string {
  return normalize(path).replaceAll("\\", "/").replace(/^\.\//, "");
}

function resolveCandidates(base: string, files: Map<string, GraphNode>): string | undefined {
  const candidates = [
    base,
    ...[".ts", ".tsx", ".mts", ".cts"].map((extension) => base.replace(/\.(?:js|jsx|mjs|cjs)$/, extension)),
    ...[".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].map((extension) => `${base}${extension}`),
    ...["index.ts", "index.tsx", "index.js", "index.jsx"].map((index) => `${base}/${index}`),
  ];
  return candidates.find((candidate) => files.has(candidate));
}

interface PackageManifest {
  dir: string;
  name?: string;
  dependencies: string[];
  entry?: string;
}

const ignoredDirectories = new Set([".git", ".projectmind", "node_modules", "dist", "build", "coverage", ".next"]);

async function findPackageManifests(root: string, dir = root): Promise<PackageManifest[]> {
  const manifests: PackageManifest[] = [];
  const packagePath = join(dir, "package.json");
  if (existsSync(packagePath)) {
    const pkg = JSON.parse(await readFile(packagePath, "utf8")) as {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      exports?: string | Record<string, unknown>;
      types?: string;
      module?: string;
      main?: string;
    };
    const rootExport = typeof pkg.exports === "string" ? pkg.exports : pkg.exports?.["."];
    const entry = typeof rootExport === "string" ? rootExport : pkg.types ?? pkg.module ?? pkg.main;
    manifests.push({
      dir,
      ...(pkg.name ? { name: pkg.name } : {}),
      dependencies: [...new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})])],
      ...(entry ? { entry } : {}),
    });
  }
  for (const item of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (item.isDirectory() && !ignoredDirectories.has(item.name)) manifests.push(...await findPackageManifests(root, join(dir, item.name)));
  }
  return manifests;
}

function packageSpecifier(specifier: string): string {
  return specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0] ?? "";
}

function insideRoot(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

async function compilerOptions(root: string): Promise<ts.CompilerOptions> {
  const configPath = ts.findConfigFile(root, ts.sys.fileExists);
  if (!configPath) return { moduleResolution: ts.ModuleResolutionKind.NodeNext, module: ts.ModuleKind.NodeNext };
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  if (loaded.error) throw new Error(`Cannot read TypeScript config: ${ts.flattenDiagnosticMessageText(loaded.error.messageText, " ")}`);
  const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, dirname(configPath));
  const error = parsed.errors.find((item) => item.category === ts.DiagnosticCategory.Error);
  if (error) throw new Error(`Cannot parse TypeScript config: ${ts.flattenDiagnosticMessageText(error.messageText, " ")}`);
  return parsed.options;
}

function resolveImport(root: string, sourcePath: string, specifier: string, files: Map<string, GraphNode>, options: ts.CompilerOptions, workspaces: Map<string, PackageManifest>): { path?: string; reason?: UnresolvedImport["reason"] } {
  if (specifier.startsWith(".")) {
    const direct = resolveCandidates(normalizeRel(join(dirname(sourcePath), specifier)), files);
    if (direct) return { path: direct };
  }
  const result = ts.resolveModuleName(specifier, join(root, sourcePath), options, ts.sys).resolvedModule;
  if (result && !result.isExternalLibraryImport) {
    if (!insideRoot(root, result.resolvedFileName)) return { reason: "outside-scan" };
    const rel = normalizeRel(relative(root, result.resolvedFileName));
    const matched = resolveCandidates(rel, files);
    return matched ? { path: matched } : { reason: "outside-scan" };
  }
  const packageName = packageSpecifier(specifier);
  const workspace = workspaces.get(packageName);
  if (workspace) {
    const subpath = specifier.slice(packageName.length).replace(/^\//, "");
    const base = subpath ? join(workspace.dir, subpath) : join(workspace.dir, workspace.entry ?? "src/index.ts");
    const matched = resolveCandidates(normalizeRel(relative(root, base)), files);
    return matched ? { path: matched } : { reason: "outside-scan" };
  }
  return { reason: "not-found" };
}

export async function buildMindGraph(root: string, config: ProjectConfig): Promise<MindGraph> {
  const parsed = await parseProject(root, config.scanner.extensions, config.scanner.exclude, config.scanner.include);
  const manifests = await findPackageManifests(root);
  const workspaceByName = new Map(manifests.filter((item): item is PackageManifest & { name: string } => Boolean(item.name)).map((item) => [item.name, item]));
  const dependencyNames = [...new Set(manifests.flatMap((item) => item.dependencies))].filter((name) => !workspaceByName.has(name)).sort();
  const packages = dependencyNames.map((name) => ({ id: stableId("pkg", name), type: "PACKAGE" as const, name }));
  const options = await compilerOptions(root);
  const nodes = [...parsed.files, ...parsed.symbols, ...packages];
  const edges: GraphEdge[] = [];
  const unresolvedImports: UnresolvedImport[] = [];
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
    const target = resolveImport(resolve(root), item.sourcePath, item.specifier, fileByPath, options, workspaceByName);
    if (target.path) {
      const to = fileByPath.get(target.path);
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
    const packageName = packageSpecifier(item.specifier);
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
      continue;
    }
    if (!item.specifier.startsWith("node:") && !builtinModules.includes(item.specifier)) unresolvedImports.push({ sourcePath: item.sourcePath, specifier: item.specifier, reason: target.reason ?? "not-found" });
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
        metadata: { confidence: "heuristic", source: "filename" },
      });
    }
  }

  return {
    version: 1,
    generatedAt: nowIso(),
    parser: "typescript-ast-5.9",
    nodes,
    edges: [...new Map(edges.map((edge) => [edge.id, edge])).values()],
    unresolvedImports: [...new Map(unresolvedImports.map((item) => [`${item.sourcePath}\0${item.specifier}`, item])).values()]
      .sort((a, b) => a.sourcePath.localeCompare(b.sourcePath) || a.specifier.localeCompare(b.specifier)),
  };
}

export async function persistMindGraph(root: string, graph: MindGraph): Promise<void> {
  await writeJson(join(root, ".projectmind", "graph.json"), graph);
}

export function graphStats(graph: MindGraph): Record<string, number> {
  const stats: Record<string, number> = { nodes: graph.nodes.length, edges: graph.edges.length };
  stats.unresolvedImports = graph.unresolvedImports.length;
  for (const node of graph.nodes) stats[node.type.toLowerCase()] = (stats[node.type.toLowerCase()] ?? 0) + 1;
  return stats;
}
