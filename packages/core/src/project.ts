import { configSchema, constitutionSchema } from "./schema.ts";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { ensureDir, projectMindDir, readJson, writeJson, type ProjectConfig, type ProjectConstitution, type VerificationCommand } from "./index.ts";

const emptyConstitution = (): ProjectConstitution => ({ version: 1, dependencyRules: [], sensitivePaths: [] });

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
  if (!existsSync(packagePath)) {
    if (existsSync(join(root, "pyproject.toml")) || existsSync(join(root, "pytest.ini")) || existsSync(join(root, "tests"))) {
      return [{ kind: "test", command: "python -m pytest --junitxml=.projectmind/runtime/pytest-junit.xml", required: true, provider: "pytest-junit" }];
    }
    return [];
  }
  const pkg = JSON.parse(await readFile(packagePath, "utf8")) as { scripts?: Record<string, string> };
  const scripts = pkg.scripts ?? {};
  const kinds = ["test", "typecheck", "build", "lint"] as const;
  const commands: VerificationCommand[] = [];
  for (const kind of kinds) {
    const script = scripts[kind];
    if (!script) continue;
    if (kind === "test" && /^node\s/.test(script) && /(?:^|\s)--test(?:\s|$)/.test(script) && !/[;&|`]/.test(script)) {
      commands.push({
        kind,
        command: script.replace(/(?:^|\s)--test(?=\s|$)/, (match) => `${match} --test-reporter=junit`),
        required: true,
        provider: "node-test-junit",
      });
      continue;
    }
    commands.push({ kind, command: commandFor(manager, kind), required: kind === "test" || kind === "typecheck", provider: "generic-command" });
  }
  if ((existsSync(join(root, "pyproject.toml")) || existsSync(join(root, "pytest.ini")))
    && !commands.some((item) => item.provider === "pytest-junit")) {
    commands.push({ kind: "test", command: "python -m pytest --junitxml=.projectmind/runtime/pytest-junit.xml", required: true, provider: "pytest-junit" });
  }
  return commands;
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
  if (existsSync(join(projectMindDir(root), "config.json"))) {
    if (!existsSync(join(projectMindDir(root), "constitution.json"))) await writeJson(join(projectMindDir(root), "constitution.json"), emptyConstitution());
    return loadConfig(root);
  }
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
      extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".py"],
      exclude: ["node_modules", "dist", "build", "coverage", ".next", ".venv", "venv", "__pycache__", ".pytest_cache"],
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
    ensureDir(join(pmDir, "runtime")),
  ]);
  await writeJson(join(pmDir, "config.json"), config);
  await writeJson(join(pmDir, "constitution.json"), emptyConstitution());
  return config;
}

export async function loadConfig(root: string): Promise<ProjectConfig> {
  return configSchema.parse(await readJson(join(projectMindDir(resolve(root)), "config.json"))) as ProjectConfig;
}

export async function loadConstitution(root: string): Promise<ProjectConstitution> {
  const path = join(projectMindDir(resolve(root)), "constitution.json");
  if (!existsSync(path)) return emptyConstitution();
  return constitutionSchema.parse(await readJson(path)) as ProjectConstitution;
}
