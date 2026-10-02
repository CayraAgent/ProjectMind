# Claude Code integration

ProjectMind exposes a local stdio MCP server:

```bash
node --experimental-strip-types apps/cli/src/index.ts mcp
```

The integration is intentionally capability-limited: Claude Code may request verification, inspect context, record decisions, and record claims, but it cannot mark its own work as verified.
