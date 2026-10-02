import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { ensureDir, projectMindDir, readJson, writeJson, type ProjectConfig, type VerificationCommand } from "./index.ts";

function detectPackageManager(root: string): string | undefined {
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) return "bun";
  if (existsSync(join(root, "package-lock.json"))) return "npm";
  return existsSync(join(root, "package.json")) ? "npm" : undefined;
}

function commandFor(manager: string | undefined, script: string): string {
  if (manager === "pnpm") return `pnpm ${script}`;
  if (manager === "yarn") return `yarn ${script}`;
  if (manager === "bun") return `bun run ${script}`;
  return `npm run ${script}`;
}

async function detectVerificationCommands(root: string, manager: string | undefined): Promise<VerificationCommand[]> {
  const packagePath = join(root, "package.json");
  if (!existsSync(packagePath)) return [];
  const pkg = JSON.parse(await readFile(packagePath, "utf8")) as { scripts?: Record<string, string> };
  const scripts = pkg.scripts ?? {};
  const kinds = ["test", "typecheck", "build", "lint"] as const;
  return kinds.flatMap((kind) => scripts[kind]
    ? [{ kind, command: commandFor(manager, kind), required: kind === "test" || kind === "typecheck" }]
    : []);
}

async function detectProjectName(root: string): Promise<string> {
  const packagePath = join(root, "package.json");
  if (existsSync(packagePath)) {
    try {
      const pkg = JSON.parse(await readFile(packagePath, "utf8")) as { name?: string };
      if (pkg.name) return pkg.name;
    } catch {
      // fall through
    }
  }
  return basename(root);
}

export async function initializeProject(rootInput: string): Promise<ProjectConfig> {
  const root = resolve(rootInput);
  const manager = detectPackageManager(root);
  const config: ProjectConfig = {
    version: 1,
    project: {
      name: await detectProjectName(root),
      root: ".",
      ...(manager ? { packageManager: manager } : {}),
    },
    scanner: {
      include: ["."],
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
      exclude: ["node_modules", "dist", "build", "coverage", ".next"],
    },
    verification: {
      commands: await detectVerificationCommands(root, manager),
    },
  };
  const pmDir = projectMindDir(root);
  await Promise.all([
    ensureDir(join(pmDir, "intents")),
    ensureDir(join(pmDir, "evidence")),
    ensureDir(join(pmDir, "proofs")),
    ensureDir(join(pmDir, "memory")),
    ensureDir(join(pmDir, "claims")),
  ]);
  await writeJson(join(pmDir, "config.json"), config);
  return config;
}

export async function loadConfig(root: string): Promise<ProjectConfig> {
  return readJson<ProjectConfig>(join(projectMindDir(resolve(root)), "config.json"));
}
