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
  discard_reason?: string;
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

export type OverrideMap = Record<string, Record<string, 'keep' | 'discard'>>;

export interface RecursivePhotoScanResult {
  groups: PhotoGroup[];
  total_photos_found: number;
  photos_processed: number;
  truncated: boolean;
  scan_path: string;
}

// ─────────────────────────── Desinstalador & Startup ──────────────

export interface InstalledApp {
  id: string;
  name: string;
  version: string;
  publisher: string;
  install_date?: string;
  size_bytes?: number;
  /** Fuente de detección: registro, WOW64, UWP o Microsoft Store */
  source?: "registry" | "registry_wow64" | "uwp" | "store";
  /** Nombre para mostrar (alias de name, compatibilidad con backend T006-T007) */
  display_name?: string;
  last_used_at?: string;
  usage_count?: number;
  last_used_days?: number;
  usage_source?: string;
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

// ─────────────────────────── Space Map & SpaceLens ───────────────

export interface SpaceMapNode {
  name: string;
  path: string;
  size_bytes: number;
  is_directory: boolean;
  children: SpaceMapNode[];
  item_count?: number;        // Cantidad de items dentro (archivos + carpetas)
  modified_at?: string;       // Fecha de última modificación (ISO-8601)
  extension?: string;         // Extensión del archivo (solo para archivos)
  is_system?: boolean;        // true si es carpeta del sistema (no seleccionable)
}

// Tipo de dispositivo de almacenamiento
export type StorageDeviceType = "local_disk" | "usb_drive" | "mtp_device" | "network_drive";

// Información de una unidad/dispositivo disponible
export interface StorageDevice {
  id: string;                   // Identificador único ("C:", "D:", "mtp://Samsung-Galaxy-S24")
  label: string;                // Nombre amigable ("Disco Local (C:)", "USB Kingston 64GB", "Dispositivo MTP")
  device_type: StorageDeviceType;
  root_path: string;            // Ruta raíz para escanear ("C:\", "E:\", "mtp://device-id/")
  total_bytes: number;          // Capacidad total del dispositivo
  used_bytes: number;           // Espacio usado
  free_bytes: number;           // Espacio libre
  is_removable: boolean;        // true para USB, MTP, SD cards
  icon_hint: string;            // "hard_drive" | "usb" | "phone" | "sd_card" | "network"
  is_ready: boolean;            // false si el dispositivo no está listo (ej: lector de CD vacío)
}

export interface DiskInfo {
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  drive_label: string;
}

export interface SpaceLensScanProgress {
  scanned_dirs: number;
  total_size: number;
  current_path: string;
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

export interface SmartCareConfig {
  model_unused_threshold_days: number;
  python_unused_threshold_days: number;
  app_unused_threshold_days: number;
  analysis_cache_hours: number;
  enable_drive_health: boolean;
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
  smartcare?: SmartCareConfig;
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

// ─── §3.6 Interfaces SpaceMap & Smart Adaptive Rules ───

export interface TreemapRect {
  path: string;
  name: string;
  rect: { x: number; y: number; w: number; h: number };
  size_bytes: number;
  depth: number;
  is_directory: boolean;
  extension?: string;
  is_system: boolean;
}

export interface SunburstArc {
  path: string;
  name: string;
  center: { x: number; y: number };
  r_inner: number;
  r_outer: number;
  start_angle: number;
  end_angle: number;
  depth: number;
  size_bytes: number;
  is_directory: boolean;
}

export type SpaceMapMode = "treemap" | "sunburst";

// ─── NL Query ───

export interface FilterCondition {
  field: string;
  operator: string;
  value: unknown;
}

export interface FileFilterQuery {
  conditions: FilterCondition[];
  logical_operator: "AND" | "OR";
}

export interface FileFilterResult {
  query_parsed: FileFilterQuery;
  matched_paths: string[];
  total_matched: number;
  total_bytes: number;
  summary: string;
}

// ─── Inspector State ───

export interface InspectorState {
  selected_path: string | null;
  node: SpaceMapNode | null;
  preview_url: string | null; // Blob URL for image/video preview
  media_type: "image" | "video" | "other" | null;
  metadata: {
    dimensions?: string;
    bitrate?: string;
    codec?: string;
    modified_at?: string;
    full_path: string;
    size_bytes: number;
  } | null;
}

// ─── Savings Bar ───

export interface SavingsInfo {
  folder_savings_bytes: number;
  folder_name: string;
  disk_savings_bytes: number;
  disk_label: string;
  disk_total_bytes: number;
  percentage: number;
}

// ─── Smart Adaptive Rules ───

export interface AutoQuarantineRule {
  id: string;
  description: string; // "Capturas de pantalla > 90 días"
  condition: FileFilterQuery;
  matched_count: number;
  matched_bytes: number;
  user_approved: boolean;
}

// ─── User Pattern Learning ───

export interface DetectedPattern {
  pattern_id: string;
  description: string; // "Siempre descartas videos < 1080p"
  confidence: number; // 0.0 - 1.0
  remaining_matches: number;
  toast_message: string; // "¿Deseas aislar automáticamente los 14 archivos restantes?"
}

// ─────────────────────────── Junk Files ──────────────────────────

/** Entrada individual de caché de un navegador */
export interface BrowserCacheEntry {
  cache_type: "cache" | "code_cache" | "gpu_cache" | "service_worker" | string;
  display_name: string;       // "Caché principal", "Caché de código", etc.
  path: string;
  size_bytes: number;
  safe: boolean;
}

/** Perfil individual de un navegador (Default, Profile 1, etc.) */
export interface BrowserProfile {
  profile_name: string;
  profile_path: string;
  cache_entries: BrowserCacheEntry[];
  total_size_bytes: number;
}

/** Resultado de escaneo de caché de un navegador */
export interface BrowserCacheProfile {
  browser_name: string;       // "Google Chrome", "Microsoft Edge", etc.
  browser_id: string;         // "chrome", "edge", "firefox", "brave", "opera", "vivaldi"
  installed: boolean;         // true si se detectó el directorio de perfiles
  profiles: BrowserProfile[];
  total_all_profiles_bytes: number;
}

/** Item individual dentro de una categoría de junk files */
export interface JunkItem {
  id: string;                 // path o identificador único
  display_name: string;       // nombre legible del archivo/grupo
  path: string;
  size_bytes: number;
  safe: boolean;              // true = "Seguro", false = "Revisar"
  age_days?: number;
  age_display?: string;       // "2 meses", "1 mes", etc.
  source_type?: string;       // "temp_user", "temp_system", "crash_dump", etc.
}

/** Categoría de junk files (resultado de un sub-escáner) */
export interface JunkCategory {
  category_id: string;        // "temp_files", "windows_leftovers", "download_installers", etc.
  display_name: string;       // "Archivos Temporales", "Restos de Windows", etc.
  total_bytes: number;
  safe_bytes: number;         // bytes de ítems marcados como safe=true
  items: JunkItem[];
  informational?: boolean;    // true para Prefetch (no limpiar automáticamente)
}

/** Resultado completo del escaneo de archivos basura */
export interface JunkFilesScanResult {
  total_junk_bytes: number;
  categories: JunkCategory[];
  browsers: BrowserCacheProfile[];
  scan_timestamp: string;     // ISO-8601
}

// ─────────────────────────── SmartCare Redesign (008) ─────────────

export interface FillForecast {
  gb_per_day: number;
  full_in_weeks: number;
  readings_count: number;
  readings_period_days: number;
}

export interface DriveHealthInfo {
  drive_letter: string;
  drive_label: string;
  drive_path: string;
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  usage_percent: number;
  disk_type: "SSD_NVMe" | "SSD_SATA" | "HDD" | "Unknown" | string;
  filesystem: string;
  smart_status: "Healthy" | "Warning" | "Critical" | "Unknown" | string;
  temperature_celsius?: number | null;
  drive_wear_percent?: number | null;
  reallocated_sectors?: number | null;
  power_on_hours?: number | null;
  fill_forecast?: FillForecast | null;
}

export interface RecycleBinDrive {
  drive_letter: string;
  drive_label: string;
  item_count: number;
  total_bytes: number;
}

export interface RecycleBinItem {
  original_path: string;
  name: string;
  size_bytes: number;
  deleted_at: string;
  file_type: string;
  recycle_path?: string | null;
  i_path?: string | null;
}

export interface RecycleBinScanResult {
  drives: RecycleBinDrive[];
  items: RecycleBinItem[];
  total_items: number;
  total_bytes: number;
}

export interface AppUsageInfo {
  app_id: string;
  last_used_at?: string | null;
  usage_count?: number | null;
  last_used_days?: number | null;
  source: "prefetch" | "userassist" | "file_modified" | "unknown" | string;
}

export interface SmartCareJunkSummary {
  temp_files_bytes: number;
  windows_leftovers_bytes: number;
  installers_bytes: number;
  browser_caches_bytes: number;
  messaging_caches_bytes: number;
  recycle_bin_bytes: number;
  total_bytes: number;
  item_count: number;
}

export interface SmartCareDevSummary {
  safe_caches_bytes: number;
  unused_models_bytes: number;
  stale_python_bytes: number;
  total_bytes: number;
  item_count: number;
}

export interface SmartCareAppsSummary {
  unused_apps_count: number;
  unused_apps_bytes: number;
}

export interface SmartCareAnalysis {
  id: string;
  timestamp: string;
  drive_health: DriveHealthInfo;
  junk_summary: SmartCareJunkSummary;
  dev_summary: SmartCareDevSummary;
  apps_summary: SmartCareAppsSummary;
  total_recoverable_bytes: number;
  is_valid: boolean;
}

