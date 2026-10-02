import type { ChangeSummary, EvidenceRecord, MindGraph, ProjectConstitution } from "../../core/src/index.ts";

export interface PolicyFinding {
  id: string;
  severity: "info" | "warning" | "error";
  message: string;
}

function inPrefix(path: string | undefined, prefix: string): boolean {
  return Boolean(path && (prefix === "." || path === prefix || path.startsWith(`${prefix.replace(/\/$/, "")}/`)));
}

export function evaluatePolicies(constitution: ProjectConstitution, graph: MindGraph, change: ChangeSummary, evidence: EvidenceRecord[], repositoryState: string): PolicyFinding[] {
  const findings: PolicyFinding[] = [];
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const rule of constitution.dependencyRules) {
    for (const edge of graph.edges.filter((item) => item.type === "IMPORTS")) {
      const from = nodes.get(edge.from);
      const to = nodes.get(edge.to);
      if (inPrefix(from?.path, rule.from) && inPrefix(to?.path, rule.cannotImport)) {
        findings.push({ id: rule.id, severity: "error", message: `${from?.path} imports forbidden dependency ${to?.path}.` });
      }
    }
    for (const item of graph.unresolvedImports.filter((entry) => inPrefix(entry.sourcePath, rule.from))) {
      findings.push({ id: rule.id, severity: "error", message: `${item.sourcePath} has unresolved import ${item.specifier}; dependency rule compliance cannot be established.` });
    }
  }
  const freshPassingKinds = new Set(evidence.filter((item) => item.repositoryState === repositoryState
    && item.repositoryStateAfter === repositoryState && item.exitCode === 0 && !item.termination && !item.evidenceError).map((item) => item.kind));
  for (const rule of constitution.sensitivePaths) {
    const matched = change.files.filter((path) => inPrefix(path, rule.prefix));
    if (!matched.length) continue;
    const missing = rule.requiredEvidenceKinds.filter((kind) => !freshPassingKinds.has(kind));
    if (missing.length) findings.push({
      id: rule.id,
      severity: "error",
      message: `Sensitive path ${rule.prefix} changed (${matched.join(", ")}) without fresh passing ${missing.join(", ")} evidence.`,
    });
  }
  return findings.sort((a, b) => a.id.localeCompare(b.id) || a.message.localeCompare(b.message));
}
