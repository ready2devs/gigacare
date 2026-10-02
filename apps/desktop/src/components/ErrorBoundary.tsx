import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@fluentui/react-components";
import { WarningRegular, ArrowClockwiseRegular } from "@fluentui/react-icons";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[GigaCare ErrorBoundary] Uncaught render error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0B101E",
            color: "#F8FAFC",
            fontFamily: "Segoe UI, -apple-system, sans-serif",
            padding: "24px",
            boxSizing: "border-box",
          }}
          data-testid="error-boundary-fallback"
        >
          <div
            style={{
              maxWidth: "560px",
              width: "100%",
              background: "rgba(15, 23, 42, 0.8)",
              border: "1px solid rgba(248, 113, 113, 0.3)",
              borderRadius: "16px",
              padding: "36px 32px",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5)",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "20px",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "rgba(248, 113, 113, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#F87171",
                fontSize: "28px",
              }}
            >
              <WarningRegular />
            </div>

            <div>
              <h2 style={{ margin: "0 0 8px 0", fontSize: "22px", fontWeight: 700 }}>
                Algo no salió como esperábamos
              </h2>
              <p style={{ margin: 0, color: "#94A3B8", fontSize: "14px", lineHeight: 1.5 }}>
                Se produjo un problema al renderizar la vista. Hemos aislado el error para prevenir problemas mayores en tu sistema.
              </p>
            </div>

            {this.state.error && (
              <div
                style={{
                  width: "100%",
                  maxHeight: "120px",
                  overflowY: "auto",
                  padding: "12px 14px",
                  background: "rgba(0, 0, 0, 0.4)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#FCA5A5",
                  fontFamily: "Consolas, monospace",
                  textAlign: "left",
                }}
              >
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <Button
              appearance="primary"
              icon={<ArrowClockwiseRegular />}
              onClick={this.handleReset}
              style={{
                background: "#00E5FF",
                color: "#080C14",
                fontWeight: 600,
                padding: "8px 24px",
                borderRadius: "8px",
                marginTop: "8px",
              }}
            >
              Reiniciar aplicación
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
