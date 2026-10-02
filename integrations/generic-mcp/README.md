# Generic MCP integration

Start `projectmind mcp` from an initialized target repository. During source development, run `node /absolute/path/ProjectMind/apps/cli/src/index.ts mcp`. stdout is reserved for MCP protocol frames; the official TypeScript SDK handles negotiation, validation, and stdio transport.

The process is local and requires no model credentials. Execution is disabled unless the operator supplies `PROJECTMIND_ALLOW_EXECUTION=1` at startup. A client must preserve its normal environment and may either set the child working directory to the repository root or provide `CLAUDE_PROJECT_DIR` as an absolute project root.

Run the reusable compatibility pilot with:

```bash
pnpm pilot:mcp
```

The pilot launches the real CLI over stdio with the official MCP client, negotiates the protocol, checks server identity/capabilities and every tool input schema, reads project context and intent, and confirms verification execution is blocked by default. CI runs the same pilot as part of the full test suite.

This establishes generic MCP protocol compatibility, not compatibility with every branded client or every future protocol extension. Client-specific lifecycle, approval, tool-search, and UI behavior still require named pilots.
