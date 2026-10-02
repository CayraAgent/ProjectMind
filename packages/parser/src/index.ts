import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { stableId, type GraphNode } from "../../core/src/index.ts";

export interface ParsedImport {
  sourcePath: string;
  specifier: string;
}

export interface ParsedSource {
  files: GraphNode[];
  symbols: GraphNode[];
  imports: ParsedImport[];
}

const ignoredDirectories = new Set([".git", ".projectmind", "node_modules", "dist", "build", "coverage", ".next"]);

async function walk(root: string, dir: string, extensions: Set<string>, exclude: Set<string>): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = relative(root, full).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name) || exclude.has(rel) || exclude.has(entry.name)) continue;
      files.push(...(await walk(root, full, extensions, exclude)));
      continue;
    }
    if (extensions.has(extname(entry.name))) files.push(full);
  }
  return files;
}

function lineNumber(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function extractSymbols(path: string, source: string, rel: string): GraphNode[] {
  const symbols: GraphNode[] = [];
  const patterns: Array<{ type: "FUNCTION" | "CLASS"; regex: RegExp }> = [
    { type: "FUNCTION", regex: /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g },
    { type: "FUNCTION", regex: /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g },
    { type: "CLASS", regex: /(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/g },
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(source)) !== null) {
      const name = match[1];
      if (!name) continue;
      symbols.push({
        id: stableId("sym", `${rel}:${pattern.type}:${name}:${match.index}`),
        type: pattern.type,
        name,
        path: rel,
        line: lineNumber(source, match.index),
      });
    }
  }
  return symbols;
}

function extractImports(source: string, rel: string): ParsedImport[] {
  const out: ParsedImport[] = [];
  const patterns = [
    /(?:import|export)\s+(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const regex of patterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(source)) !== null) {
      const specifier = match[1];
      if (specifier) out.push({ sourcePath: rel, specifier });
    }
  }
  return out;
}

export async function parseProject(root: string, extensions: string[], exclude: string[]): Promise<ParsedSource> {
  const resolvedRoot = resolve(root);
  const sourceFiles = await walk(resolvedRoot, resolvedRoot, new Set(extensions), new Set(exclude));
  const files: GraphNode[] = [];
  const symbols: GraphNode[] = [];
  const imports: ParsedImport[] = [];

  for (const path of sourceFiles) {
    const rel = relative(resolvedRoot, path).replaceAll("\\", "/");
    const isTest = /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.[^.]+$/.test(rel);
    files.push({
      id: stableId("file", rel),
      type: isTest ? "TEST" : "FILE",
      name: rel.split("/").at(-1) ?? rel,
      path: rel,
    });
    const source = await readFile(path, "utf8");
    symbols.push(...extractSymbols(path, source, rel));
    imports.push(...extractImports(source, rel));
  }

  return { files, symbols, imports };
}
