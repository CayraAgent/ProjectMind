import { loadConfig } from "../../core/src/project.ts";
import { loadIntent } from "../../intent/src/index.ts";
import { repositoryState, summarizeChanges } from "../../git/src/index.ts";
import { buildMindGraph, persistMindGraph } from "../../graph/src/index.ts";
import { collectVerificationEvidence } from "../../evidence/src/index.ts";
import { createProofPack } from "../../proofpack/src/index.ts";
import { verifyIntent } from "./index.ts";

export async function verifyProject(root: string, intentId?: string, base?: string) {
  const state = await repositoryState(root);
  const config = await loadConfig(root);
  const intent = await loadIntent(root, intentId);
  const graph = await buildMindGraph(root, config);
  await persistMindGraph(root, graph);
  const change = await summarizeChanges(root, graph, base);
  const evidence = await collectVerificationEvidence(root, config);
  const result = verifyIntent(config, intent, evidence, state);
  if (await repositoryState(root) !== state) {
    result.status = "NOT_VERIFIED";
    result.reasons.push("Repository changed during verification; rerun against a stable state.");
  }
  const proof = await createProofPack(root, config.project.name, intent, change, evidence, result);
  return { intent, evidence, result, proof };
}
