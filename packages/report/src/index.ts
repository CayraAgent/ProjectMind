import type { ChangeSummary, EvidenceRecord, IntentContract, MindGraph, ProjectConfig, VerificationResult } from "../../core/src/index.ts";

const mark = (value: boolean): string => (value ? "✓" : "✗");

export function formatInit(config: ProjectConfig, graph: MindGraph): string {
  const files = graph.nodes.filter((node) => node.type === "FILE" || node.type === "TEST").length;
  const symbols = graph.nodes.filter((node) => node.type === "FUNCTION" || node.type === "CLASS").length;
  return [
    "ProjectMind",
    "",
    `✓ Project: ${config.project.name}`,
    `✓ Package manager: ${config.project.packageManager ?? "not detected"}`,
    `✓ Source files: ${files}`,
    `✓ Symbols: ${symbols}`,
    `✓ Graph edges: ${graph.edges.length}`,
    "",
    ".projectmind initialized.",
  ].join("\n");
}

export function formatIntent(intent: IntentContract): string {
  return [
    `Intent ${intent.id} created`,
    "",
    intent.title,
    "",
    ...intent.requirements.map((requirement) => `${requirement.id}  ${requirement.statement}  [${requirement.evidenceKinds.join(", ")}]`),
  ].join("\n");
}

export function formatChanges(change: ChangeSummary): string {
  return [
    "ProjectMind Changes",
    "",
    `Changed files: ${change.files.length}`,
    ...change.files.map((file) => `  • ${file}`),
    "",
    `Changed symbols: ${change.changedSymbols.length}`,
    ...change.changedSymbols.map((symbol) => `  • ${symbol.type.toLowerCase()} ${symbol.name}${symbol.path ? ` (${symbol.path})` : ""}`),
    "",
    `Indirectly affected files: ${change.affectedFiles.length}`,
    ...change.affectedFiles.map((file) => `  • ${file}`),
  ].join("\n");
}

export function formatVerification(intent: IntentContract, evidence: EvidenceRecord[], result: VerificationResult): string {
  const lines = [
    "PROJECTMIND VERIFY",
    "",
    `${intent.id} — ${intent.title}`,
    "",
    "Evidence",
  ];
  for (const item of evidence) lines.push(`${mark(item.exitCode === 0)} ${item.kind.padEnd(10)} ${item.command ?? "recorded evidence"}`);
  lines.push("", "Requirements");
  for (const requirement of intent.requirements) {
    const verification = result.requirements.find((item) => item.requirementId === requirement.id);
    lines.push(`${verification?.status === "VERIFIED" ? "✓" : verification?.status === "FAILED" ? "✗" : "?"} ${requirement.id}  ${requirement.statement}`);
  }
  lines.push("", "RESULT", "", result.status);
  if (result.reasons.length) lines.push("", ...result.reasons.map((reason) => `• ${reason}`));
  return lines.join("\n");
}
