import { createInterface } from "node:readline";
import { join } from "node:path";
import { loadConfig } from "../../core/src/project.ts";
import { projectMindDir, readJson, writeJson, nowIso, stableId, type MindGraph } from "../../core/src/index.ts";
import { loadIntent } from "../../intent/src/index.ts";
import { summarizeChanges } from "../../git/src/index.ts";
import { collectVerificationEvidence } from "../../evidence/src/index.ts";
import { verifyIntent } from "../../verifier/src/index.ts";
import { createProofPack } from "../../proofpack/src/index.ts";
import { recordMemory } from "../../memory/src/index.ts";

interface RpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function send(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

const tools = [
  {
    name: "projectmind.get_project_context",
    description: "Read the current ProjectMind graph summary and project configuration.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "projectmind.get_intent",
    description: "Read the current or requested intent contract.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "projectmind.get_changed_symbols",
    description: "Return current working-tree changes and affected symbols.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "projectmind.request_verification",
    description: "Run configured evidence commands and compute a verification result. This does not let an agent set verification status directly.",
    inputSchema: { type: "object", properties: { intentId: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "projectmind.record_decision",
    description: "Record an engineering decision in local project memory.",
    inputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "projectmind.record_claim",
    description: "Record an agent or human claim as an unverified claim. Claims are never treated as verification evidence by themselves.",
    inputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" } }, additionalProperties: false },
  },
] as const;

async function callTool(root: string, name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === "projectmind.get_project_context") {
    const config = await loadConfig(root);
    const graph = await readJson<MindGraph>(join(projectMindDir(root), "graph.json"));
    return {
      project: config.project,
      graph: {
        generatedAt: graph.generatedAt,
        parser: graph.parser,
        nodes: graph.nodes.length,
        edges: graph.edges.length,
      },
      principles: ["local-first", "model-agnostic", "evidence-over-claims", "no-self-verification"],
    };
  }
  if (name === "projectmind.get_intent") {
    const id = typeof args.id === "string" ? args.id : undefined;
    return loadIntent(root, id);
  }
  if (name === "projectmind.get_changed_symbols") {
    const graph = await readJson<MindGraph>(join(projectMindDir(root), "graph.json"));
    return summarizeChanges(root, graph);
  }
  if (name === "projectmind.request_verification") {
    const config = await loadConfig(root);
    const intent = await loadIntent(root, typeof args.intentId === "string" ? args.intentId : undefined);
    const graph = await readJson<MindGraph>(join(projectMindDir(root), "graph.json"));
    const evidence = await collectVerificationEvidence(root, config);
    const verification = verifyIntent(config, intent, evidence);
    const change = await summarizeChanges(root, graph);
    const proof = await createProofPack(root, config.project.name, intent, change, evidence, verification);
    return { verification, proofId: proof.id };
  }
  if (name === "projectmind.record_decision") {
    if (typeof args.text !== "string" || !args.text.trim()) throw new Error("text is required");
    return recordMemory(root, "decision", args.text.trim());
  }
  if (name === "projectmind.record_claim") {
    if (typeof args.text !== "string" || !args.text.trim()) throw new Error("text is required");
    const createdAt = nowIso();
    const claim = {
      id: stableId("claim", `${args.text}:${createdAt}`),
      text: args.text.trim(),
      createdAt,
      status: "UNPROVEN",
    };
    await writeJson(join(projectMindDir(root), "claims", `${claim.id}.json`), claim);
    return claim;
  }
  throw new Error(`Unknown tool: ${name}`);
}

export async function runMcpServer(root = process.cwd()): Promise<void> {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let request: RpcRequest;
    try {
      request = JSON.parse(line) as RpcRequest;
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      continue;
    }
    const id = request.id ?? null;
    try {
      if (request.method === "initialize") {
        send({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "projectmind", version: "0.1.0-dev" },
          },
        });
      } else if (request.method === "notifications/initialized") {
        continue;
      } else if (request.method === "tools/list") {
        send({ jsonrpc: "2.0", id, result: { tools } });
      } else if (request.method === "tools/call") {
        const name = String(request.params?.name ?? "");
        const args = (request.params?.arguments ?? {}) as Record<string, unknown>;
        const value = await callTool(root, name, args);
        send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
            isError: false,
          },
        });
      } else {
        send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${request.method}` } });
      }
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
      });
    }
  }
}
