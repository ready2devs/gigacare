// Modelos TypeScript espejo 1:1 de los modelos Rust y esquemas JSON de spec.md

// ─────────────────────────── General & Platform ───────────────────

export type Platform = "windows" | "android";

export type ModuleStatus = "completed" | "error" | "skipped" | "cancelled";

export type ScanModule =
  | "messaging_cache"
  | "dev_dependencies"
  | "system_temp"
  | "installers"
  | "photo_duplicates"
  | "uninstall_residuals"
  | "startup_items";

export type ItemCategory =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "cache"
  | "dependency"
  | "installer"
  | "temp";

// ─────────────────────────── Escaneo & Resultados ───────────────────

export interface ItemMetadata {
  app_source?: string;
  project_name?: string;
  days_inactive?: number;
  [key: string]: unknown;
}

export interface ScanItem {
  path: string;
  size_bytes: number;
  modified_at: string; // ISO-8601
  category: ItemCategory;
  metadata: ItemMetadata;
}

export interface ModuleScanResult {
  module_id: string;
  status: ModuleStatus;
  duration_ms: number;
  items_found: number;
  total_size_bytes: number;
  items: ScanItem[];
}

export interface ScanResult {
  id: string;
  timestamp: string; // ISO-8601
  platform: Platform;
  modules: ModuleScanResult[];
  total_recoverable_bytes: number;
  total_items: number;
}

export interface ScanFilters {
  min_age_days?: number;
  max_size_bytes?: number;
  min_size_bytes?: number;
  categories?: ItemCategory[];
  excluded_paths?: string[];
}

export interface CategorySummary {
  count: number;
  total_bytes: number;
}

export interface PreviewResult {
  modules: string[];
  total_items: number;
  total_bytes: number;
  by_category: Record<string, CategorySummary>;
}

export interface CleanError {
  path: string;
  reason: string;
}

export interface CleanResult {
  scan_id: string;
  timestamp: string;
  items_moved: number;
  items_failed: number;
  bytes_freed: number;
  errors: CleanError[];
}

// ─────────────────────────── Cuarentena ───────────────────────────

export type QuarantineStatus = "quarantined" | "restored" | "purged";

export interface QuarantineEntry {
  id: string;
  original_path: string;
  quarantine_path: string;
  sha256: string;
  size_bytes: number;
  quarantined_at: string; // ISO-8601
  expires_at: string; // ISO-8601
  source_module: string;
  status: QuarantineStatus;
}

export interface QuarantineManifest {
  version: number;
  entries: QuarantineEntry[];
}

export interface QuarantineFilters {
  source_module?: string;
  search_query?: string;
  status?: QuarantineStatus;
}

export interface QuarantineStats {
  total_items: number;
  total_bytes: number;
  max_space_bytes: number;
  oldest_quarantined_at?: string;
}

export interface RestoreResult {
  restored_count: number;
  errors: string[];
}

export interface PurgeResult {
  purged_count: number;
}

// ─────────────────────────── Curador de Fotos IA ──────────────────

export type AiProviderId =
  | "google_ai_studio"
  | "freellmapi"
  | "ollama"
  | "local_fallback";

export interface PhotoAiAnalysis {
  provider_used: string;
  sharpness_score: number;
  eyes_open_score: number;
  composition_score: number;
  noise_score: number;
  total_score: number;
  rank: number;
  recommendation: "keep" | "discard" | string;
}

export interface PhotoItem {
  path: string;
  original_resolution: string;
  size_bytes: number;
  phash: string;
  thumbnail_path?: string;
  ai_analysis?: PhotoAiAnalysis;
}

export interface PhotoGroup {
  group_id: string;
  similarity_method: string;
  avg_hamming_distance: number;
  photos: PhotoItem[];
}

// ─────────────────────────── Desinstalador & Startup ──────────────

export interface InstalledApp {
  id: string;
  name: string;
  version: string;
  publisher: string;
  install_date?: string;
  size_bytes?: number;
}

export interface UninstallResult {
  success: boolean;
  message: string;
}

export interface ResidualScanResult {
  app_name: string;
  residual_paths: string[];
  total_residual_bytes: number;
}

export type StartupSource =
  | "startup_folder"
  | "registry_hkcu"
  | "registry_hklm"
  | "task_scheduler"
  | "auto_service";

export type ImpactLevel = "high" | "medium" | "low";

export interface StartupItem {
  id: string;
  name: string;
  path: string;
  source: string;
  impact: string;
  enabled: boolean;
  protected: boolean;
}

// ─────────────────────────── Space Map ────────────────────────────

export interface SpaceMapNode {
  name: string;
  path: string;
  size_bytes: number;
  is_directory: boolean;
  children: SpaceMapNode[];
}

// ─────────────────────────── Configuración ────────────────────────

export interface ScanningConfig {
  temp_min_age_days: number;
  dev_inactive_days: number;
  whatsapp_cache_path?: string;
  telegram_cache_path?: string;
  excluded_paths: string[];
}

export interface QuarantineConfig {
  retention_days: number;
  max_size_gb: number;
}

export interface PhotosConfig {
  keep_count: number;
  phash_threshold: number;
  thumbnail_max_px: number;
  thumbnail_quality: number;
  thumbnail_max_kb: number;
}

export interface AiProvidersConfig {
  enabled: string[];
  priority_order: string[];
  rate_limits: Record<string, number>;
}

export interface ByokConfig {
  google_ai_studio?: string;
  ollama_endpoint?: string;
  ollama_model?: string;
}

export interface SpaceMapConfig {
  preview_threshold_mb: number;
}

export interface AppConfig {
  version: number;
  scanning: ScanningConfig;
  quarantine: QuarantineConfig;
  photos: PhotosConfig;
  ai_providers: AiProvidersConfig;
  byok: ByokConfig;
  space_map: SpaceMapConfig;
  theme: "obsidian_dark" | "light" | string;
  language: "es" | "en" | string;
}

// ─────────────────────────── Licencia ─────────────────────────────

export type LicenseTier = "free" | "byok" | "pro";

export interface ValidationResult {
  valid: boolean;
  message: string;
}

export interface ActivationResult {
  success: boolean;
  tier: string;
  message: string;
}

// ─────────────────────────── Streaming Events ─────────────────────

export interface ScanProgress {
  module: ScanModule;
  items_scanned: number;
  items_found: number;
  bytes_found: number;
  percent: number;
  eta_seconds?: number;
}

export interface CleanProgress {
  items_total: number;
  items_moved: number;
  bytes_freed: number;
  current_file: string;
}

export interface AiAnalysisProgress {
  groups_analyzed: number;
  groups_total: number;
  current_provider: string;
  current_group_id: string;
}
