# Generic MCP

Start `node /absolute/path/ProjectMind/apps/cli/src/index.ts mcp` from the target repository root. stdout carries MCP protocol messages only. The official v1 MCP TypeScript SDK handles negotiation, validation, and stdio transport.

The process is local, requires no model credentials, and exposes the same tool set to any compatible client. Execution is disabled unless the operator supplies `PROJECTMIND_ALLOW_EXECUTION=1` at startup. The transport is tested using the SDK's real stdio client; each named agent client still needs its own compatibility pilot.
