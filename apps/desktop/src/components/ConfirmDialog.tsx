import React from "react";
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Button,
  Text,
} from "@fluentui/react-components";
import { ShieldCheckmarkRegular, WarningRegular } from "@fluentui/react-icons";

export interface ConfirmDialogProps {
  open: boolean;
  itemCount: number;
  totalBytes: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  itemCount,
  totalBytes,
  onConfirm,
  onCancel,
}) => {
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <Dialog open={open} onOpenChange={(_, data) => !data.open && onCancel()}>
      <DialogSurface style={{ maxWidth: "460px", background: "#0F172A", border: "1px solid rgba(0, 229, 255, 0.3)" }}>
        <DialogBody>
          <DialogTitle style={{ color: "#00E5FF", display: "flex", alignItems: "center", gap: "8px" }}>
            <ShieldCheckmarkRegular style={{ fontSize: "24px" }} />
            Confirmar Limpieza a Cuarentena
          </DialogTitle>

          <DialogContent style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px" }}>
            <Text size={300} style={{ color: "#F8FAFC" }}>
              Estás a punto de limpiar los elementos seleccionados:
            </Text>

            <div style={{
              background: "rgba(0, 229, 255, 0.06)",
              padding: "12px 16px",
              borderRadius: "8px",
              border: "1px solid rgba(0, 229, 255, 0.15)",
              display: "flex",
              justifyContent: "space-between"
            }}>
              <div>
                <Text weight="semibold" style={{ display: "block", color: "#F8FAFC" }}>
                  {itemCount} archivos
                </Text>
                <Text size={200} style={{ color: "#94A3B8" }}>
                  Seleccionados para aislamiento
                </Text>
              </div>
              <div style={{ textAlign: "right" }}>
                <Text weight="semibold" style={{ display: "block", color: "#00E5FF" }}>
                  {formatBytes(totalBytes)}
                </Text>
                <Text size={200} style={{ color: "#94A3B8" }}>
                  Espacio a liberar
                </Text>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#F59E0B", fontSize: "12px" }}>
              <WarningRegular />
              <span>
                Los archivos se moverán a la cuarentena reversible (retención por 7 días). Podrás restaurarlos en cualquier momento.
              </span>
            </div>
          </DialogContent>

          <DialogActions style={{ marginTop: "20px" }}>
            <Button appearance="secondary" onClick={onCancel}>
              Cancelar
            </Button>
            <Button
              appearance="primary"
              style={{ backgroundColor: "#00E5FF", color: "#0B0F19", fontWeight: 600 }}
              onClick={onConfirm}
            >
              Confirmar y Mover
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};
