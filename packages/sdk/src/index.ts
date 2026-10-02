import type { EvidenceRecord, ProjectConfig } from "../../core/src/index.ts";

export interface EvidenceProviderContext {
  root: string;
  config: ProjectConfig;
}

export interface EvidenceProvider {
  name: string;
  collect(context: EvidenceProviderContext): Promise<EvidenceRecord[]>;
}

export function defineEvidenceProvider(provider: EvidenceProvider): EvidenceProvider {
  return provider;
}
