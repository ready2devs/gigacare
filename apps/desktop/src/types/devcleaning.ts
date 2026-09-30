// apps/desktop/src/types/devcleaning.ts
// Tipos TypeScript espejo 1:1 de los contratos Rust de gigacare-devcleaning

export type DevCategory = "ml_models" | "dev_cache" | "app_data";
export type DevSafety = "safe" | "caution" | "risky";

export interface DevChildEntry {
  name: string;
  path: string;
  size_bytes: number;
}

export interface DevFinding {
  rule_id: string;
  name: string;
  description: string;
  category: DevCategory;
  safety: DevSafety;
  path: string;
  size_bytes: number;
  file_count: number;
  stale_days: number | null;
  children: DevChildEntry[];
  read_error: string | null;
}

export interface DevCleanReport {
  disk_total: number;
  disk_free: number;
  findings: DevFinding[];
}

export interface MlModelEntry {
  provider: string;
  name: string;
  size_bytes: number;
  exclusive_bytes: number;
  paths: string[];
  downloaded_days: number | null;
  last_used_days: number | null;
  used_since_download: boolean;
  note: string | null;
}

export interface MlModelReport {
  total_bytes: number;
  unused_bytes: number;
  usage_tracking_reliable: boolean;
  models: MlModelEntry[];
}

export interface PyPackage {
  name: string;
  path: string;
  size_bytes: number;
}

export interface PyEnv {
  name: string;
  path: string;
  kind: string; // "virtualenv" | "conda"
  size_bytes: number;
  stale_days: number | null;
  packages: PyPackage[];
}

export interface PyDuplicate {
  name: string;
  copies: number;
  total_bytes: number;
  wasted_bytes: number;
}

export interface PyReport {
  total_bytes: number;
  wasted_bytes: number;
  envs: PyEnv[];
  duplicates: PyDuplicate[];
}

export interface DevCleanOutcome {
  freed_bytes: number;
  quarantined_count: number;
  errors: string[];
}

export type CleanKind = "cache" | "model" | "environment" | "userfile" | "app";

export interface ConfirmRequest {
  kind: CleanKind;
  name: string;
  paths: string[];
  size_bytes: number;
  is_risky?: boolean;
  items?: { name: string; path: string; size_bytes: number }[];
  onConfirm: () => Promise<void> | void;
}
