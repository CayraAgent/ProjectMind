# Engineering Memory Lite

ProjectMind stores small local records for engineering decisions, constraints, and incidents. Retrieval is deterministic lexical matching: exact phrases receive the strongest boost, matching normalized terms add score, and ties use newest-first ordering followed by stable id. No embedding service, model API, or network access is required.

```bash
projectmind remember decision "Use PostgreSQL for transactional data"
projectmind remember constraint "Verification must remain deterministic"
projectmind remember incident "Connection pool exhausted during import"
projectmind recall "PostgreSQL import" --limit 5
projectmind recall "deterministic" --type constraint
```

The MCP tools `projectmind_record_decision` and `projectmind_search_memory` expose the same local behavior. Search arguments are schema validated and malformed stored records fail closed instead of being silently omitted.

Memory text is declared, untrusted project context. It is never command evidence, never enters requirement verification, and cannot set or strengthen a verdict. Do not store secrets: records are plain JSON under `.projectmind/memory/` and are intended to stay local.
