export interface ReleaseBlocker {
  code: string;
  message: string;
}

export interface ReleaseReadinessReport {
  ready: boolean;
  blockers: ReleaseBlocker[];
}

export function assessReleaseReadiness(manifest: Record<string, any>, expectedName?: string): ReleaseReadinessReport;
