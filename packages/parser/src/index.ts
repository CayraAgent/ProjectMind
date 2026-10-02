import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve, isAbsolute } from "node:path";
import ts from "typescript";
import { stableId, type GraphNode } from "../../core/src/index.ts";

export interface ParsedImport { sourcePath: string; specifier: string; }
export interface ParsedSource { files: GraphNode[]; symbols: GraphNode[]; imports: ParsedImport[]; }
export type ParsedSourceContent = Pick<ParsedSource, "symbols" | "imports">;
const ignoredDirectories = new Set([".git", ".projectmind", "node_modules", "dist", "build", "coverage", ".next"]);

async function walk(root: string, dir: string, extensions: Set<string>, exclude: Set<string>): Promise<string[]> {
  const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = relative(root, full).replaceAll("\\", "/");
    if ([...exclude].some((path) => rel === path || rel.startsWith(`${path}/`)) || exclude.has(entry.name)) continue;
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) files.push(...await walk(root, full, extensions, exclude));
    } else if (entry.isFile() && extensions.has(extname(entry.name))) files.push(full);
    // Symlinks are never followed outside the repository.
  }
  return files;
}

export function parseSourceContent(path: string, rel: string, source: string): ParsedSourceContent {
  const symbols: GraphNode[] = [];
  const imports: ParsedImport[] = [];
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const diagnostics = ts.transpileModule(source, { fileName: path, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ESNext, jsx: ts.JsxEmit.Preserve } }).diagnostics ?? [];
  const error = diagnostics.find((item) => item.category === ts.DiagnosticCategory.Error);
  if (error) throw new Error(`Cannot parse ${rel}: ${ts.flattenDiagnosticMessageText(error.messageText, " ")}`);
  const addSymbol = (node: ts.Node, name: string, type: "FUNCTION" | "CLASS") => {
    const start = node.getStart(parsed);
    symbols.push({ id: stableId("sym", `${rel}:${type}:${name}:${start}`), type, name, path: rel, line: parsed.getLineAndCharacterOfPosition(start).line + 1 });
  };
  const addImport = (node: ts.Expression | undefined) => {
    if (node && ts.isStringLiteralLike(node)) imports.push({ sourcePath: rel, specifier: node.text });
  };
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name) addSymbol(node, node.name.text, "FUNCTION");
    if (ts.isClassDeclaration(node) && node.name) addSymbol(node, node.name.text, "CLASS");
    if (ts.isMethodDeclaration(node)) addSymbol(node, node.name.getText(parsed), "FUNCTION");
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) addSymbol(node, node.name.text, "FUNCTION");
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) addImport(node.moduleSpecifier);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) addImport(node.moduleReference.expression);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require")) addImport(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return { symbols, imports };
}

export async function parseProject(root: string, extensions: string[], exclude: string[], include = ["."]): Promise<ParsedSource> {
  for (const path of include) {
    if (isAbsolute(path) || path.split(/[\\/]/).includes("..") || /[*?]/.test(path)) throw new Error("Scanner include entries must be relative path prefixes.");
  }
  const resolvedRoot = resolve(root);
  const sourceFiles = (await walk(resolvedRoot, resolvedRoot, new Set(extensions), new Set(exclude)))
    .filter((path) => include.some((prefix) => prefix === "." || relative(resolvedRoot, path).replaceAll("\\", "/") === prefix
      || relative(resolvedRoot, path).replaceAll("\\", "/").startsWith(`${prefix.replace(/\/$/, "")}/`)));
  const files: GraphNode[] = [];
  const symbols: GraphNode[] = [];
  const imports: ParsedImport[] = [];
  for (const path of sourceFiles) {
    const rel = relative(resolvedRoot, path).replaceAll("\\", "/");
    const isTest = /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.[^.]+$/.test(rel);
    files.push({ id: stableId("file", rel), type: isTest ? "TEST" : "FILE", name: rel.split("/").at(-1) ?? rel, path: rel });
    const parsed = parseSourceContent(path, rel, await readFile(path, "utf8"));
    symbols.push(...parsed.symbols);
    imports.push(...parsed.imports);
  }
  return { files, symbols, imports };
}
