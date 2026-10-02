#!/usr/bin/env node
import { resolve } from "node:path";
import { initializeProject, loadConfig } from "../../../packages/core/src/project.ts";
import { buildMindGraph, persistMindGraph } from "../../../packages/graph/src/index.ts";
import { createIntent, bindRequirement } from "../../../packages/intent/src/index.ts";
import { summarizeChanges } from "../../../packages/git/src/index.ts";
import { verifyProject } from "../../../packages/verifier/src/project.ts";
import { formatChanges, formatInit, formatIntent, formatVerification } from "../../../packages/report/src/index.ts";
import { runMcpServer } from "../../../packages/mcp/src/index.ts";
import { recordMemory, type MemoryType } from "../../../packages/memory/src/index.ts";

interface ParsedArgs {
  positionals: string[];
  options: Map<string, string[]>;
}

function parseArgs(input: string[]): ParsedArgs {
  const positionals: string[] = [];
  const options = new Map<string, string[]>();
  for (let index = 0; index < input.length; index += 1) {
    const value = input[index];
    if (!value) continue;
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = input[index + 1];
    if (next && !next.startsWith("--")) {
      options.set(key, [...(options.get(key) ?? []), next]);
      index += 1;
    } else {
      options.set(key, ["true"]);
    }
  }
  return { positionals, options };
}

function optionValues(args: ParsedArgs, key: string): string[] {
  return args.options.get(key) ?? [];
}

function help(): string {
  return `ProjectMind v0.1.0-dev\n\nCommands:\n  init\n  scan\n  changes\n  intent create <title> [--require <text>] [--preserve <text>] [--out-of-scope <text>]\n  intent bind <requirement-id> --command <configured-command> [--test <exact-name>] [--intent <id>]\n  verify [intent-id] [--base <git-ref>]\n  remember <decision|constraint|incident> <text>\n  mcp\n`;
}

async function main(): Promise<void> {
  const root = resolve(process.cwd());
  const args = parseArgs(process.argv.slice(2));
  const [command, subcommand, ...rest] = args.positionals;

  if (args.options.has("help") || !command || command === "help" || command === "--help" || command === "-h") {
    console.log(help());
    return;
  }

  if (command === "init") {
    const config = await initializeProject(root);
    const graph = await buildMindGraph(root, config);
    await persistMindGraph(root, graph);
    console.log(formatInit(config, graph));
    return;
  }

  if (command === "scan") {
    const config = await loadConfig(root);
    const graph = await buildMindGraph(root, config);
    await persistMindGraph(root, graph);
    const files = graph.nodes.filter((node) => node.type === "FILE" || node.type === "TEST").length;
    const symbols = graph.nodes.filter((node) => node.type === "FUNCTION" || node.type === "CLASS").length;
    console.log(`Scan complete\n\nFiles: ${files}\nSymbols: ${symbols}\nEdges: ${graph.edges.length}`);
    return;
  }

  if (command === "changes") {
    const graph = await buildMindGraph(root, await loadConfig(root));
    console.log(formatChanges(await summarizeChanges(root, graph, optionValues(args, "base")[0])));
    return;
  }

  if (command === "intent" && subcommand === "create") {
    const title = rest.join(" ").trim();
    if (!title) throw new Error("Intent title is required.");
    const intent = await createIntent(
      root,
      title,
      optionValues(args, "require"),
      optionValues(args, "preserve"),
      optionValues(args, "out-of-scope"),
    );
    console.log(formatIntent(intent));
    return;
  }

  if (command === "intent" && subcommand === "bind") {
    const requirementId = rest[0];
    const configuredCommand = optionValues(args, "command")[0];
    if (!requirementId || !configuredCommand) throw new Error("Usage: intent bind REQ-1 --command <configured-command>");
    const intent = await bindRequirement(
      root,
      requirementId,
      configuredCommand,
      optionValues(args, "intent")[0],
      optionValues(args, "test"),
    );
    console.log(formatIntent(intent));
    return;
  }

  if (command === "verify") {
    const { intent, evidence, result, proof } = await verifyProject(root, subcommand, optionValues(args, "base")[0]);
    console.log(`${formatVerification(intent, evidence, result)}\n\nProofPack: ${proof.id}`);
    if (result.status !== "VERIFIED") process.exitCode = 2;
    return;
  }

  if (command === "remember") {
    const type = subcommand as MemoryType | undefined;
    const text = rest.join(" ").trim();
    if (!type || !["decision", "constraint", "incident"].includes(type) || !text) {
      throw new Error("Usage: projectmind remember <decision|constraint|incident> <text>");
    }
    const item = await recordMemory(root, type, text);
    console.log(`${item.type} recorded: ${item.id}`);
    return;
  }

  if (command === "mcp") {
    await runMcpServer(root, { allowExecution: process.env.PROJECTMIND_ALLOW_EXECUTION === "1" });
    return;
  }

  throw new Error(`Unknown command.\n\n${help()}`);
}

main().catch((error) => {
  console.error(`ProjectMind error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
