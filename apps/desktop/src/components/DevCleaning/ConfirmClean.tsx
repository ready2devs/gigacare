import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text, Spinner } from "@fluentui/react-components";
import {
  WarningRegular,
  ShieldDismissRegular,
  DismissRegular,
} from "@fluentui/react-icons";
import { ConfirmRequest } from "../../types/devcleaning";

export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

interface ConfirmCleanProps {
  request: ConfirmRequest | null;
  onClose: () => void;
  retentionDays?: number;
}

export const ConfirmClean: React.FC<ConfirmCleanProps> = ({
  request,
  onClose,
}) => {
  const { t } = useTranslation();
  const [cleaning, setCleaning] = useState(false);

  if (!request) return null;

  const getConsequenceText = () => {
    switch (request.kind) {
      case "cache":
        return t(
          "dev_cleaning.confirm.consequenceCache",
          "Estos archivos de caché se regenerarán automáticamente la próxima vez que ejecutes el gestor de paquetes o herramienta correspondiente."
        );
      case "model":
        return t(
          "dev_cleaning.confirm.consequenceModel",
          "Los pesos de los modelos seleccionados se moverán a cuarentena. Para volver a usarlos deberás restaurarlos o descargarlos nuevamente."
        );
      case "environment":
        return t(
          "dev_cleaning.confirm.consequenceEnv",
          "El entorno virtual completo y sus paquetes instalados se moverán a cuarentena. Deberás recrear el entorno si deseas ejecutar ese proyecto."
        );
      case "app":
      case "userfile":
      default:
        return t(
          "dev_cleaning.confirm.quarantineNotice",
          "Todos los archivos se mueven a la Cuarentena Reversible de GigaCare y pueden restaurarse en cualquier momento antes de que expire el período de retención."
        );
    }
  };

  const handleConfirm = async () => {
    setCleaning(true);
    try {
      await request.onConfirm();
    } finally {
      setCleaning(false);
      onClose();
    }
  };

  const itemsList = request.items || request.paths.map((p) => ({
    name: p.split(/[/\\]/).pop() || p,
    path: p,
    size_bytes: 0,
  }));

  const displayLimit = 4;
  const visibleItems = itemsList.slice(0, displayLimit);
  const remainingCount = itemsList.length - displayLimit;

  return (
    <div
      className="confirm-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="confirm-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-modal-header">
          <div className="confirm-modal-title-group">
            <ShieldDismissRegular className="confirm-modal-icon" />
            <Text weight="bold" size={400} className="confirm-modal-title">
              {request.kind === "cache"
                ? t("dev_cleaning.confirm.titleClean", {
                    name: request.name,
                    defaultValue: `¿Limpiar ${request.name}?`,
                  })
                : t("dev_cleaning.confirm.titleRemove", {
                    name: request.name,
                    defaultValue: `¿Eliminar ${request.name}?`,
                  })}
            </Text>
          </div>
          <Button
            appearance="subtle"
            icon={<DismissRegular />}
            size="small"
            onClick={onClose}
            aria-label="Cerrar"
          />
        </div>

        {request.is_risky && (
          <div className="confirm-risky-alert">
            <WarningRegular />
            <span>
              {t(
                "dev_cleaning.confirm.riskyAlert",
                "¡Precaución! Este elemento contiene datos de estado o contenedores que podrían no regenerarse automáticamente."
              )}
            </span>
          </div>
        )}

        <div className="confirm-consequence">
          <Text size={200} style={{ color: "#CBD5E1" }}>
            {getConsequenceText()}
          </Text>
        </div>

        <div className="confirm-items-box">
          <div className="confirm-items-header">
            <Text size={200} weight="semibold" style={{ color: "#94A3B8" }}>
              {t("dev_cleaning.confirm.itemsHeader", "Elementos a mover a cuarentena")} ({itemsList.length}):
            </Text>
            <Text size={200} weight="bold" style={{ color: "#00E5FF" }}>
              {t("dev_cleaning.confirm.totalLabel", {
                size: formatBytes(request.size_bytes),
                defaultValue: `Total: ${formatBytes(request.size_bytes)}`,
              })}
            </Text>
          </div>
          <ul className="confirm-items-list">
            {visibleItems.map((item, idx) => (
              <li key={idx} className="confirm-item-entry">
                <span className="confirm-item-name" title={item.path}>
                  {item.name}
                </span>
                {item.size_bytes > 0 && (
                  <span className="confirm-item-size">
                    {formatBytes(item.size_bytes)}
                  </span>
                )}
              </li>
            ))}
            {remainingCount > 0 && (
              <li className="confirm-item-more">
                {t("dev_cleaning.confirm.moreItems", {
                  count: remainingCount,
                  defaultValue: `...y ${remainingCount} más`,
                })}
              </li>
            )}
          </ul>
        </div>

        <div className="confirm-modal-footer-note">
          <Text size={100} style={{ color: "#94A3B8" }}>
            {t(
              "dev_cleaning.confirm.quarantineNotice",
              "Todos los archivos se mueven a la Cuarentena Reversible de GigaCare y pueden restaurarse en cualquier momento antes de que expire el período de retención."
            )}
          </Text>
        </div>

        <div className="confirm-modal-actions">
          <Button
            appearance="secondary"
            onClick={onClose}
            disabled={cleaning}
          >
            {t("dev_cleaning.confirm.keepBtn", "No, conservar")}
          </Button>
          <Button
            appearance="primary"
            style={{
              backgroundColor: "#EF4444",
              color: "#FFFFFF",
              fontWeight: 600,
            }}
            onClick={handleConfirm}
            disabled={cleaning}
          >
            {cleaning ? (
              <>
                <Spinner size="tiny" style={{ marginRight: "6px" }} />
                {t("dev_cleaning.confirm.movingBtn", "Moviendo a cuarentena...")}
              </>
            ) : request.kind === "cache" ? (
              t("dev_cleaning.confirm.confirmCleanBtn", {
                size: formatBytes(request.size_bytes),
                defaultValue: `Sí, limpiar (${formatBytes(request.size_bytes)})`,
              })
            ) : (
              t("dev_cleaning.confirm.confirmRemoveBtn", {
                size: formatBytes(request.size_bytes),
                defaultValue: `Sí, eliminar (${formatBytes(request.size_bytes)})`,
              })
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
