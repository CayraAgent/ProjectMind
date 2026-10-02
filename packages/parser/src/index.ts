import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve, isAbsolute } from "node:path";
import ts from "typescript";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { stableId, type GraphNode } from "../../core/src/index.ts";

export interface ParsedImport { sourcePath: string; specifier: string; language: "javascript" | "python"; }
export interface ParsedSource { files: GraphNode[]; symbols: GraphNode[]; imports: ParsedImport[]; }
export type ParsedSourceContent = Pick<ParsedSource, "symbols" | "imports">;
const ignoredDirectories = new Set([".git", ".projectmind", "node_modules", "dist", "build", "coverage", ".next", ".venv", "venv", "__pycache__", ".pytest_cache"]);

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

function parsePythonSource(path: string, rel: string, source: string): ParsedSourceContent {
  const script = `import ast,json,sys\ns=ast.parse(sys.stdin.read(), filename=sys.argv[1])\nout={"symbols":[],"imports":[]}\nfor n in ast.walk(s):\n if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)): out["symbols"].append({"name":n.name,"type":"FUNCTION","line":n.lineno,"column":n.col_offset})\n elif isinstance(n,ast.ClassDef): out["symbols"].append({"name":n.name,"type":"CLASS","line":n.lineno,"column":n.col_offset})\n elif isinstance(n,ast.Import):\n  for a in n.names: out["imports"].append(a.name)\n elif isinstance(n,ast.ImportFrom):\n  prefix=("."*n.level)+(n.module or "")\n  if n.module: out["imports"].append(prefix)\n  else:\n   for a in n.names: out["imports"].append(prefix+a.name)\nprint(json.dumps(out,separators=(",",":")))`;
  const commands: string[][] = process.platform === "win32" ? [["py", "-3"], ["python"]] : [["python3"], ["python"]];
  let result: SpawnSyncReturns<string> | undefined;
  for (const attempt of commands) {
    const command = attempt[0];
    if (!command) continue;
    result = spawnSync(command, [...attempt.slice(1), "-c", script, rel], { input: source, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
    if (!result.error) break;
  }
  if (!result || result.error) throw new Error(`Cannot parse ${rel}: Python 3 is required.`);
  if (result.status !== 0) throw new Error(`Cannot parse ${rel}: ${result.stderr.trim() || "invalid Python syntax"}`);
  const parsed = JSON.parse(result.stdout) as { symbols: Array<{ name: string; type: "FUNCTION" | "CLASS"; line: number; column: number }>; imports: string[] };
  return {
    symbols: parsed.symbols.map((item) => ({ id: stableId("sym", `${rel}:${item.type}:${item.name}:${item.line}:${item.column}`), type: item.type, name: item.name, path: rel, line: item.line })),
    imports: parsed.imports.map((specifier) => ({ sourcePath: rel, specifier, language: "python" })),
  };
}

export function parseSourceContent(path: string, rel: string, source: string): ParsedSourceContent {
  if (extname(path) === ".py") return parsePythonSource(path, rel, source);
  const symbols: GraphNode[] = [];
  const imports: ParsedImport[] = [];
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  // Declaration files intentionally produce no JavaScript. Asking transpileModule
  // to emit them throws "Debug Failure. Output generation failed" in TypeScript.
  const declarationFile = /\.d\.(?:ts|mts|cts)$/.test(path);
  const diagnostics = declarationFile ? [] : ts.transpileModule(source, { fileName: path, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ESNext, jsx: ts.JsxEmit.Preserve } }).diagnostics ?? [];
  const error = diagnostics.find((item) => item.category === ts.DiagnosticCategory.Error);
  if (error) throw new Error(`Cannot parse ${rel}: ${ts.flattenDiagnosticMessageText(error.messageText, " ")}`);
  const addSymbol = (node: ts.Node, name: string, type: "FUNCTION" | "CLASS") => {
    const start = node.getStart(parsed);
    symbols.push({ id: stableId("sym", `${rel}:${type}:${name}:${start}`), type, name, path: rel, line: parsed.getLineAndCharacterOfPosition(start).line + 1 });
  };
  const addImport = (node: ts.Expression | undefined) => {
    if (node && ts.isStringLiteralLike(node)) imports.push({ sourcePath: rel, specifier: node.text, language: "javascript" });
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
    const isTest = /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.[^.]+$|(?:^|\/)test_[^/]+\.py$|_test\.py$/.test(rel);
    files.push({ id: stableId("file", rel), type: isTest ? "TEST" : "FILE", name: rel.split("/").at(-1) ?? rel, path: rel });
    const parsed = parseSourceContent(path, rel, await readFile(path, "utf8"));
    symbols.push(...parsed.symbols);
    imports.push(...parsed.imports);
  }
  return { files, symbols, imports };
}
