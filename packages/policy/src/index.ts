export interface PolicyFinding {
  id: string;
  severity: "info" | "warning" | "error";
  message: string;
}

export function evaluatePolicies(): PolicyFinding[] {
  return [];
}
