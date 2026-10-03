import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { initializeProject } from "../packages/core/src/project.ts";
import { createIntent } from "../packages/intent/src/index.ts";

const exec = promisify(execFile);
const cli = resolve("apps/cli/src/index.ts");

test("generic stdio and Claude-style project-root pilots negotiate and expose the safe contract", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pm-mcp-pilot-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "mcp-pilot", type: "module" }));
  await writeFile(join(root, "src", "index.ts"), "export const value = 1;\n");
  await exec("git", ["init", "-q"], { cwd: root });
  await exec("git", ["add", "."], { cwd: root });
  await exec("git", ["-c", "user.name=ProjectMind Pilot", "-c", "user.email=pilot@example.com", "commit", "-qm", "fixture"], { cwd: root });
  await initializeProject(root);
  await createIntent(root, "MCP compatibility", ["Safe context is readable"], [], []);

  const client = new Client({ name: "generic-mcp-pilot", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli, "mcp"],
    cwd: resolve("."),
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
      CLAUDE_PROJECT_DIR: root,
      PROJECTMIND_ALLOW_EXECUTION: "0",
    },
  });
  t.after(() => client.close());
  await client.connect(transport);
  assert.deepEqual(client.getServerVersion(), { name: "projectmind", version: "0.1.0-dev.0" });
  assert.equal(client.getServerCapabilities()?.tools?.listChanged, true);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((item) => item.name).sort(), [
    "projectmind_get_changed_symbols",
    "projectmind_get_claim_report",
    "projectmind_get_constraints",
    "projectmind_get_evidence",
    "projectmind_get_intent",
    "projectmind_get_project_context",
    "projectmind_record_claim",
    "projectmind_record_decision",
    "projectmind_request_verification",
    "projectmind_search_memory",
  ]);
  assert.ok(tools.every((item) => item.inputSchema.type === "object"));
  const context = await client.callTool({ name: "projectmind_get_project_context", arguments: {} });
  assert.match(JSON.stringify(context.content), /mcp-pilot/);
  const intent = await client.callTool({ name: "projectmind_get_intent", arguments: {} });
  assert.match(JSON.stringify(intent.content), /MCP compatibility/);
  const blocked = await client.callTool({ name: "projectmind_request_verification", arguments: {} });
  assert.equal(blocked.isError, true);
  await client.callTool({ name: "projectmind_record_decision", arguments: { text: "Keep MCP execution disabled by default" } });
  const memory = await client.callTool({ name: "projectmind_search_memory", arguments: { query: "execution disabled", type: "decision" } });
  assert.match(JSON.stringify(memory.content), /Keep MCP execution disabled by default/);
});

test("Claude Code project MCP example is explicit stdio with execution disabled", async () => {
  const parsed = JSON.parse(await readFile(resolve("integrations/claude-code/project.mcp.example.json"), "utf8"));
  assert.deepEqual(parsed, {
    mcpServers: {
      projectmind: {
        type: "stdio",
        command: "projectmind",
        args: ["mcp"],
        env: { PROJECTMIND_ALLOW_EXECUTION: "0" },
        timeout: 600000,
      },
    },
  });
});
