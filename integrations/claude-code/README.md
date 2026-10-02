# Claude Code integration

ProjectMind is a local stdio MCP server built with the official TypeScript SDK. It reads `CLAUDE_PROJECT_DIR`, which Claude Code supplies to stdio servers, so project-scoped sessions resolve the repository root without a nonstandard `cwd` field.

After installing a ProjectMind preview package so the `projectmind` binary is on `PATH`, copy [`project.mcp.example.json`](project.mcp.example.json) to `.mcp.json` in the target repository. Keep execution disabled while validating the connection:

```json
{
  "mcpServers": {
    "projectmind": {
      "type": "stdio",
      "command": "projectmind",
      "args": ["mcp"],
      "env": { "PROJECTMIND_ALLOW_EXECUTION": "0" },
      "timeout": 600000
    }
  }
}
```

For source development, use an absolute CLI path instead:

```json
{
  "mcpServers": {
    "projectmind": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/ProjectMind/apps/cli/src/index.ts", "mcp"],
      "env": { "PROJECTMIND_ALLOW_EXECUTION": "0" },
      "timeout": 600000
    }
  }
}
```

The equivalent Claude Code command is:

```bash
claude mcp add --transport stdio --scope project projectmind -- projectmind mcp
claude mcp get projectmind
```

Claude Code requires interactive workspace/server approval for a newly cloned project-scoped `.mcp.json`. Review the command before approving it. Initialize the target repository with `projectmind init` first. Startup requires no model API key.

Execution remains disabled unless the operator changes `PROJECTMIND_ALLOW_EXECUTION` to `1`. That permits `projectmind_request_verification` to run the reviewed commands in `.projectmind/config.json`; it does not let the model set a verdict.

The automated compatibility pilot exercises Claude-style `CLAUDE_PROJECT_DIR` startup, protocol negotiation, server identity/capabilities, all nine tool schemas, safe context/intent calls, and the default execution block. The checked-in Claude config shape is also tested. An interactive Claude Code binary/session pilot remains pending because it requires an installed, authenticated Claude Code client and project approval; the repository does not claim that session has already happened.
