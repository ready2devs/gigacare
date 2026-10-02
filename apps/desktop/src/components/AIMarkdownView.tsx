import React from "react";

interface AIMarkdownViewProps {
  content: string;
}

// Renderiza texto con negritas (**bold**), cursivas (*italic*) y código (`code`)
function renderInlineFormatting(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    if (match[1]) {
      // **bold**
      parts.push(
        <strong key={match.index} style={{ color: "#F8FAFC", fontWeight: 700 }}>
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // *italic*
      parts.push(
        <em key={match.index} style={{ color: "#CBD5E1", fontStyle: "italic" }}>
          {match[4]}
        </em>
      );
    } else if (match[5]) {
      // `code`
      parts.push(
        <code
          key={match.index}
          style={{
            background: "rgba(0, 229, 255, 0.12)",
            color: "#00E5FF",
            padding: "2px 6px",
            borderRadius: "4px",
            fontFamily: "ui-monospace, monospace",
            fontSize: "12px",
          }}
        >
          {match[6]}
        </code>
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

// Detecta si una celda es un valor de tamaño de archivo (ej: 88.3 GB, 611.4 MB, etc.)
function isSizeValue(str: string): boolean {
  return /^[0-9]+(\.[0-9]+)?\s*(B|KB|MB|GB|TB|PB)$/i.test(str.trim());
}

export const AIMarkdownView: React.FC<AIMarkdownViewProps> = ({ content }) => {
  if (!content) return null;

  const rawLines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let keyIndex = 0;

  while (i < rawLines.length) {
    const rawLine = rawLines[i];
    const trimmed = rawLine.trim();

    // 1. Detección de Tabla Markdown
    if (
      trimmed.startsWith("|") &&
      trimmed.endsWith("|") &&
      i + 1 < rawLines.length &&
      /^\|?\s*:?-+:?\s*\|/.test(rawLines[i + 1].trim())
    ) {
      const headerLine = trimmed;
      i += 2; // saltar encabezado y separador

      const parseCells = (rowText: string) =>
        rowText
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());

      const headers = parseCells(headerLine);
      const rows: string[][] = [];

      while (
        i < rawLines.length &&
        rawLines[i].trim().startsWith("|") &&
        rawLines[i].trim().endsWith("|")
      ) {
        rows.push(parseCells(rawLines[i]));
        i++;
      }

      elements.push(
        <div key={keyIndex++} className="nl-table-wrapper">
          <table className="nl-markdown-table">
            <thead>
              <tr>
                {headers.map((th, thIdx) => (
                  <th key={thIdx}>{renderInlineFormatting(th)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map((cell, cIdx) => {
                    const isSize = isSizeValue(cell);
                    return (
                      <td key={cIdx}>
                        {isSize ? (
                          <span className="nl-size-badge">{cell}</span>
                        ) : (
                          renderInlineFormatting(cell)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // 2. Encabezados
    if (trimmed.startsWith("### ")) {
      elements.push(
        <h3 key={keyIndex++} className="nl-markdown-h3">
          {renderInlineFormatting(trimmed.slice(4))}
        </h3>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      elements.push(
        <h2 key={keyIndex++} className="nl-markdown-h2">
          {renderInlineFormatting(trimmed.slice(3))}
        </h2>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith("# ")) {
      elements.push(
        <h1 key={keyIndex++} className="nl-markdown-h1">
          {renderInlineFormatting(trimmed.slice(2))}
        </h1>
      );
      i++;
      continue;
    }

    // 3. Listas con viñetas
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const items: string[] = [];
      while (
        i < rawLines.length &&
        (rawLines[i].trim().startsWith("- ") || rawLines[i].trim().startsWith("* "))
      ) {
        items.push(rawLines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      elements.push(
        <ul key={keyIndex++} className="nl-markdown-list">
          {items.map((item, idx) => (
            <li key={idx}>{renderInlineFormatting(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // 4. Citas o Bloques de sugerencia (>)
    if (trimmed.startsWith("> ")) {
      elements.push(
        <div key={keyIndex++} className="nl-markdown-blockquote">
          <span className="nl-blockquote-icon">💡</span>
          <div>{renderInlineFormatting(trimmed.slice(2))}</div>
        </div>
      );
      i++;
      continue;
    }

    // 5. Línea vacía
    if (trimmed === "") {
      i++;
      continue;
    }

    // 6. Párrafo continuo
    let paragraphText = trimmed;
    i++;
    while (
      i < rawLines.length &&
      rawLines[i].trim() !== "" &&
      !rawLines[i].trim().startsWith("|") &&
      !rawLines[i].trim().startsWith("#") &&
      !rawLines[i].trim().startsWith("- ") &&
      !rawLines[i].trim().startsWith("* ") &&
      !rawLines[i].trim().startsWith("> ")
    ) {
      paragraphText += " " + rawLines[i].trim();
      i++;
    }

    elements.push(
      <p key={keyIndex++} className="nl-markdown-p">
        {renderInlineFormatting(paragraphText)}
      </p>
    );
  }

  return <div className="nl-markdown-container">{elements}</div>;
};
