import React, { useState, useEffect } from "react";
import {
  Button,
  Text,
  Input,
  SpinButton,
  Switch,
  Dropdown,
  Option,
  Badge,
  Spinner,
} from "@fluentui/react-components";
import {
  SaveRegular,
  ArrowUploadRegular,
  ArrowDownloadRegular,
  CheckmarkCircleRegular,
  DismissCircleRegular,
  DismissRegular,
  SettingsRegular,
  KeyRegular,
  ShieldRegular,
  TimerRegular,
  BrainCircuitRegular,
  BroomRegular,
} from "@fluentui/react-icons";
import { invoke } from "@tauri-apps/api/core";
import { AppConfig, ValidationResult, SmartCareConfig } from "../types/models";
import "./settingsPanel.css";

export interface SettingsPanelProps {
  onClose?: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [byokKey, setByokKey] = useState<string>("");
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState<boolean>(false);
  const [isCustomQuarantine, setIsCustomQuarantine] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const handleSmartCareChange = async (updates: Partial<SmartCareConfig>) => {
    if (!config) return;
    const currentSmartcare = config.smartcare || {
      model_unused_threshold_days: 730,
      python_unused_threshold_days: 730,
      app_unused_threshold_days: 730,
      analysis_cache_hours: 1,
      enable_drive_health: true,
    };
    const updated = {
      ...config,
      smartcare: {
        ...currentSmartcare,
        ...updates,
      },
    };
    setConfig(updated);
    try {
      await invoke("update_config", { config: updated });
    } catch (err) {
      console.error("Error al actualizar configuración de SmartCare:", err);
    }
  };

  const handleQuarantineSizeChange = async (val: number) => {
    if (!config) return;
    const updated = {
      ...config,
      quarantine: {
        ...config.quarantine,
        max_size_gb: val,
      },
    };
    setConfig(updated);
    try {
      await invoke("update_config", {
        config: updated,
      });
    } catch (err) {
      console.error("Error al actualizar límite de cuarentena:", err);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const cfg = await invoke<AppConfig>("get_config");
      if (cfg && cfg.quarantine && (cfg.quarantine.max_size_gb === 5 || !cfg.quarantine.max_size_gb)) {
        cfg.quarantine.max_size_gb = 50;
      }
      setConfig(cfg);
      setByokKey(cfg.byok?.google_ai_studio || "");
      if (cfg && cfg.quarantine && ![50, 100, 200].includes(cfg.quarantine.max_size_gb)) {
        setIsCustomQuarantine(true);
      }
      setLoading(false);
    } catch (err) {
      console.error("Error al cargar configuración:", err);
      // Fallback default
      const defaultCfg: AppConfig = {
        version: 1,
        scanning: {
          temp_min_age_days: 7,
          dev_inactive_days: 30,
          excluded_paths: [],
        },
        quarantine: {
          retention_days: 7,
          max_size_gb: 50,
        },
        photos: {
          keep_count: 1,
          phash_threshold: 8,
          thumbnail_max_px: 512,
          thumbnail_quality: 60,
          thumbnail_max_kb: 100,
        },
        ai_providers: {
          enabled: ["google_ai_studio", "freellmapi", "ollama"],
          priority_order: ["google_ai_studio", "freellmapi", "ollama"],
          rate_limits: {
            google_ai_studio: 10,
            freellmapi: 30,
            ollama: 0,
          },
        },
        byok: {
          google_ai_studio: "",
        },
        space_map: {
          preview_threshold_mb: 50,
        },
        theme: "obsidian_dark",
        language: "es",
      };
      setConfig(defaultCfg);
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const updated: AppConfig = {
        ...config,
        byok: {
          ...config.byok,
          google_ai_studio: byokKey,
        },
      };
      const res = await invoke<AppConfig>("update_config", { config: updated });
      setConfig(res || updated);
      setSaving(false);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        if (onClose) {
          onClose();
        }
      }, 700);
    } catch (err) {
      console.error("Error al guardar config:", err);
      setSaving(false);
    }
  };

  const handleValidateKey = async () => {
    setValidating(true);
    try {
      const res = await invoke<ValidationResult>("validate_api_key", {
        provider: "google_ai_studio",
        key: byokKey,
      });
      setValidationResult(res);
      setValidating(false);
    } catch (err) {
      console.error("Error al validar clave:", err);
      setValidationResult({ valid: false, message: "Error al validar" });
      setValidating(false);
    }
  };

  const handleExport = async () => {
    try {
      const json = await invoke<string>("export_config");
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "gigacare_config.json";
      a.click();
    } catch (err) {
      console.error("Error al exportar:", err);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const imported = await invoke<AppConfig>("import_config", { json: text });
      setConfig(imported);
      setByokKey(imported.byok?.google_ai_studio || "");
    } catch (err) {
      console.error("Error al importar config:", err);
    }
  };

  if (loading || !config) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
        <Spinner size="large" label="Cargando configuración..." />
      </div>
    );
  }

  return (
    <div className="settings-container">
      {/* Botones Globales */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {onClose && (
              <Button
                appearance="subtle"
                icon={<DismissRegular />}
                onClick={onClose}
                title="Cerrar configuración y volver"
              />
            )}
            <Text weight="bold" size={500} style={{ color: "#F8FAFC", display: "block" }}>
              Configuración del Sistema
            </Text>
          </div>
          <Text size={200} style={{ color: "#94A3B8" }}>
            Parámetros globales de escaneo, cuarentena, privacidad y modelos de IA.
          </Text>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <Button appearance="subtle" icon={<ArrowUploadRegular />} onClick={handleExport}>
            Exportar
          </Button>
          <label style={{ cursor: "pointer", display: "inline-flex" }}>
            <Button appearance="subtle" icon={<ArrowDownloadRegular />}>
              Importar
            </Button>
            <input type="file" accept=".json" style={{ display: "none" }} onChange={handleImport} />
          </label>
          <Button
            appearance="primary"
            icon={<SaveRegular />}
            style={{ backgroundColor: "#00E5FF", color: "#0B0F19", fontWeight: 600 }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Guardando..." : "Guardar Cambios"}
          </Button>
          {onClose && (
            <Button appearance="subtle" onClick={onClose}>
              Cerrar
            </Button>
          )}
        </div>
      </div>

      {saveSuccess && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: "10px",
            background: "rgba(0, 229, 255, 0.15)",
            border: "1px solid #00E5FF",
            color: "#00E5FF",
            fontSize: "13px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            boxShadow: "0 0 15px rgba(0, 229, 255, 0.25)",
            animation: "gc-fade-slide 0.2s ease-out",
          }}
        >
          <CheckmarkCircleRegular style={{ fontSize: "20px" }} />
          <span>Configuración guardada correctamente. Los cambios se han aplicado al sistema.</span>
        </div>
      )}

      {/* 1. Umbrales de Escaneo */}
      <div className="settings-section-card">
        <div className="settings-section-title">
          <TimerRegular />
          <span>Umbrales de Limpieza y Escaneo</span>
        </div>

        <div className="settings-field-row">
          <div className="settings-field-info">
            <span className="settings-field-label">Antigüedad mínima de temporales</span>
            <span className="settings-field-desc">Días mínimos desde la última modificación para marcar archivos temporales.</span>
          </div>
          <SpinButton
            value={config.scanning.temp_min_age_days}
            min={1}
            max={365}
            onChange={(_, data) =>
              setConfig({
                ...config,
                scanning: { ...config.scanning, temp_min_age_days: data.value ?? 7 },
              })
            }
          />
        </div>

        <div className="settings-field-row">
          <div className="settings-field-info">
            <span className="settings-field-label">Inactividad de proyectos dev</span>
            <span className="settings-field-desc">Días sin modificar para sugerir limpieza de node_modules y cachés de dependencias.</span>
          </div>
          <SpinButton
            value={config.scanning.dev_inactive_days}
            min={7}
            max={365}
            onChange={(_, data) =>
              setConfig({
                ...config,
                scanning: { ...config.scanning, dev_inactive_days: data.value ?? 30 },
              })
            }
          />
        </div>

        <div className="settings-field-row">
          <div className="settings-field-info">
            <span className="settings-field-label">Umbral de previsualización Space Map</span>
            <span className="settings-field-desc">Tamaño mínimo en MB para activar tooltips flotantes en hover.</span>
          </div>
          <SpinButton
            value={config.space_map.preview_threshold_mb}
            min={10}
            max={500}
            onChange={(_, data) =>
              setConfig({
                ...config,
                space_map: { ...config.space_map, preview_threshold_mb: data.value ?? 50 },
              })
            }
          />
        </div>
      </div>

      {/* 2. Cuarentena y Retención */}
      <div className="settings-section-card">
        <div className="settings-section-title">
          <ShieldRegular />
          <span>Política de Cuarentena Reversible</span>
        </div>

        <div className="settings-field-row">
          <div className="settings-field-info">
            <span className="settings-field-label">Días de retención (1 a 90 días)</span>
            <span className="settings-field-desc">Tiempo antes de la purga permanente de los archivos en cuarentena.</span>
          </div>
          <SpinButton
            value={config.quarantine.retention_days}
            min={1}
            max={90}
            onChange={(_, data) =>
              setConfig({
                ...config,
                quarantine: { ...config.quarantine, retention_days: data.value ?? 7 },
              })
            }
          />
        </div>

        <div className="settings-field-row" style={{ alignItems: "flex-start" }}>
          <div className="settings-field-info">
            <span className="settings-field-label">Límite de espacio de cuarentena</span>
            <span className="settings-field-desc">
              Capacidad máxima asignada a la cuarentena (50 GB por defecto para cachés y modelos ML).
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
            <div style={{ display: "flex", gap: "6px" }}>
              {[50, 100, 200].map((preset) => {
                const isSelected = config.quarantine.max_size_gb === preset && !isCustomQuarantine;
                return (
                  <Button
                    key={preset}
                    size="small"
                    appearance={isSelected ? "primary" : "secondary"}
                    style={{
                      backgroundColor: isSelected ? "#00E5FF" : "rgba(255, 255, 255, 0.06)",
                      color: isSelected ? "#0B0F19" : "#F8FAFC",
                      fontWeight: isSelected ? 700 : 500,
                      minWidth: "68px",
                    }}
                    onClick={() => {
                      setIsCustomQuarantine(false);
                      handleQuarantineSizeChange(preset);
                    }}
                  >
                    {preset} GB
                  </Button>
                );
              })}
              <Button
                size="small"
                appearance={isCustomQuarantine ? "primary" : "secondary"}
                style={{
                  backgroundColor: isCustomQuarantine ? "#00E5FF" : "rgba(255, 255, 255, 0.06)",
                  color: isCustomQuarantine ? "#0B0F19" : "#F8FAFC",
                  fontWeight: isCustomQuarantine ? 700 : 500,
                }}
                onClick={() => setIsCustomQuarantine(true)}
              >
                Personalizado
              </Button>
            </div>
            {isCustomQuarantine && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <SpinButton
                  value={config.quarantine.max_size_gb}
                  min={1}
                  max={500}
                  onChange={(_, data) => {
                    const val = data.value ?? 50;
                    handleQuarantineSizeChange(val);
                  }}
                />
                <Text size={200} style={{ color: "#94A3B8" }}>GB</Text>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Curador de Fotos e IA (BYOK) */}
      <div className="settings-section-card">
        <div className="settings-section-title">
          <BrainCircuitRegular />
          <span>Curador de Fotos e Inteligencia Artificial</span>
        </div>

        <div className="settings-field-row">
          <div className="settings-field-info">
            <span className="settings-field-label">Fotos a conservar por grupo</span>
            <span className="settings-field-desc">Cantidad de tomas recomendadas como mejores para cada ráfaga o grupo similar.</span>
          </div>
          <Dropdown
            value={`${config.photos.keep_count} toma${config.photos.keep_count > 1 ? "s" : ""}`}
            onOptionSelect={(_, data) =>
              setConfig({
                ...config,
                photos: { ...config.photos, keep_count: Number(data.optionValue) || 1 },
              })
            }
          >
            <Option value="1">1 toma</Option>
            <Option value="2">2 tomas</Option>
            <Option value="3">3 tomas</Option>
          </Dropdown>
        </div>

        <div className="settings-field-row">
          <div className="settings-field-info">
            <span className="settings-field-label">Umbral de similitud pHash (Distancia Hamming)</span>
            <span className="settings-field-desc">Distancia máxima (default: 8) para agrupar fotos como idénticas o similares.</span>
          </div>
          <SpinButton
            value={config.photos.phash_threshold}
            min={1}
            max={20}
            onChange={(_, data) =>
              setConfig({
                ...config,
                photos: { ...config.photos, phash_threshold: data.value ?? 8 },
              })
            }
          />
        </div>

        {/* BYOK Google AI Studio Key */}
        <div className="settings-field-row">
          <div className="settings-field-info">
            <span className="settings-field-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <KeyRegular style={{ color: "#00E5FF" }} />
              API Key Google AI Studio (BYOK)
            </span>
            <span className="settings-field-desc">Habilita análisis multimodal en la nube enviando únicamente miniaturas reducidas (≤512px, ≤100KB).</span>
          </div>
          <div className="byok-validation-box">
            <Input
              type="password"
              placeholder="AIzaSy..."
              value={byokKey}
              onChange={(_, data) => {
                setByokKey(data.value);
                setValidationResult(null);
              }}
            />
            <Button appearance="secondary" onClick={handleValidateKey} disabled={validating || !byokKey}>
              {validating ? "Validando..." : "Validar"}
            </Button>
            {validationResult && (
              validationResult.valid ? (
                <CheckmarkCircleRegular className="byok-status-valid" title={validationResult.message} />
              ) : (
                <DismissCircleRegular className="byok-status-invalid" title={validationResult.message} />
              )
            )}
          </div>
        </div>
      </div>

      {/* Cuidado Inteligente */}
      <div className="settings-section-card" data-testid="settings-smartcare-section">
        <div className="settings-section-title">
          <BroomRegular />
          <span>Cuidado Inteligente</span>
        </div>

        <div className="settings-field-row">
          <div className="settings-field-info">
            <span className="settings-field-label">Umbral de no uso de modelos IA (días)</span>
            <span className="settings-field-desc">Días sin uso para sugerir eliminación de modelos IA descargados.</span>
          </div>
          <SpinButton
            value={config.smartcare?.model_unused_threshold_days ?? 730}
            min={30}
            max={1825}
            onChange={(_, data) =>
              handleSmartCareChange({ model_unused_threshold_days: data.value ?? 730 })
            }
          />
        </div>

        <div className="settings-field-row">
          <div className="settings-field-info">
            <span className="settings-field-label">Umbral de no uso de entornos Python (días)</span>
            <span className="settings-field-desc">Días sin actividad en el entorno virtual para sugerir limpieza.</span>
          </div>
          <SpinButton
            value={config.smartcare?.python_unused_threshold_days ?? 730}
            min={30}
            max={1825}
            onChange={(_, data) =>
              handleSmartCareChange({ python_unused_threshold_days: data.value ?? 730 })
            }
          />
        </div>

        <div className="settings-field-row">
          <div className="settings-field-info">
            <span className="settings-field-label">Umbral de no uso de aplicaciones (días)</span>
            <span className="settings-field-desc">Días sin ejecutar la aplicación para catalogarla como no utilizada.</span>
          </div>
          <SpinButton
            value={config.smartcare?.app_unused_threshold_days ?? 730}
            min={30}
            max={1825}
            onChange={(_, data) =>
              handleSmartCareChange({ app_unused_threshold_days: data.value ?? 730 })
            }
          />
        </div>

        <div className="settings-field-row">
          <div className="settings-field-info">
            <span className="settings-field-label">Validez del análisis (horas)</span>
            <span className="settings-field-desc">Tiempo durante el cual se reutilizan los resultados del análisis previo.</span>
          </div>
          <SpinButton
            value={config.smartcare?.analysis_cache_hours ?? 1}
            min={1}
            max={168}
            onChange={(_, data) =>
              handleSmartCareChange({ analysis_cache_hours: data.value ?? 1 })
            }
          />
        </div>

        <div className="settings-field-row">
          <div className="settings-field-info">
            <span className="settings-field-label">Habilitar lectura SMART del disco</span>
            <span className="settings-field-desc">Lee temperatura, desgaste y salud física mediante WMI / MSFT_PhysicalDisk.</span>
          </div>
          <Switch
            checked={config.smartcare?.enable_drive_health ?? true}
            onChange={(_, data) =>
              handleSmartCareChange({ enable_drive_health: Boolean(data.checked) })
            }
          />
        </div>
      </div>

      {/* 4. Sistema, Permisos y Entorno */}
      <div className="settings-section-card">
        <div className="settings-section-title">
          <SettingsRegular />
          <span>Sistema y Preferencias</span>
        </div>

        <div className="settings-field-row">
          <div className="settings-field-info">
            <span className="settings-field-label">Modo Shizuku / Root (Android)</span>
            <span className="settings-field-desc">Acceso elevado para limpieza de datos de apps en Android. Deshabilitado en Windows.</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Badge size="small" appearance="outline">Solo Android</Badge>
            <Switch disabled checked={false} />
          </div>
        </div>

        <div className="settings-field-row">
          <div className="settings-field-info">
            <span className="settings-field-label">Idioma de la aplicación</span>
            <span className="settings-field-desc">Selecciona el idioma de la interfaz gráfica.</span>
          </div>
          <Dropdown
            value={config.language === "es" ? "Español" : "English"}
            onOptionSelect={async (_, data) => {
              const lang = (data.optionValue as "es" | "en") || "es";
              if (typeof window !== "undefined" && window.localStorage) {
                window.localStorage.setItem("gigacare_lang", lang);
              }
              const { default: i18n } = await import("../i18n");
              await i18n.changeLanguage(lang);
              setConfig({ ...config, language: lang });
            }}
          >
            <Option value="es">Español</Option>
            <Option value="en">English</Option>
          </Dropdown>
        </div>

        <div className="settings-field-row">
          <div className="settings-field-info">
            <span className="settings-field-label">Tema visual</span>
            <span className="settings-field-desc">Elige entre Obsidian Dark (con Mica) o tema claro.</span>
          </div>
          <Dropdown
            value={config.theme === "obsidian_dark" ? "Obsidian Dark (Mica)" : "Light Theme"}
            onOptionSelect={(_, data) =>
              setConfig({ ...config, theme: data.optionValue || "obsidian_dark" })
            }
          >
            <Option value="obsidian_dark">Obsidian Dark (Mica)</Option>
            <Option value="light">Light Theme</Option>
          </Dropdown>
        </div>
      </div>
    </div>
  );
};
