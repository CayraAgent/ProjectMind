# Claude Code integration

The server is model-independent and uses the official MCP SDK stdio transport. Add the following entry to your client's MCP server configuration, replacing the absolute paths:

```json
{
  "mcpServers": {
    "projectmind": {
      "command": "node",
      "args": ["/absolute/path/ProjectMind/apps/cli/src/index.ts", "mcp"],
      "cwd": "/absolute/path/your-trusted-repository"
    }
  }
}
```

Client configuration formats differ; set the server working directory with the equivalent supported mechanism in your client. Initialize the target repository first. Startup does not require a model API key.

Command execution is disabled by default. If you authorize the agent to request execution of trusted repository code, set `PROJECTMIND_ALLOW_EXECUTION=1` in the server process environment. This is an operator decision, not a tool argument.

Available tools: `projectmind_get_project_context`, `projectmind_get_intent`, `projectmind_get_constraints`, `projectmind_get_changed_symbols`, `projectmind_get_evidence`, `projectmind_request_verification`, `projectmind_record_decision`, `projectmind_record_claim`.

A real SDK client handshake is tested in CI. An actual Claude Code user-session pilot remains a release gate; this document does not claim that one has already happened.
