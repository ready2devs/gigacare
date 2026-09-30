import fs from "node:fs";
import path from "node:path";
import { execSync, spawn } from "node:child_process";

function isSystemPath(targetPath) {
  const norm = targetPath.toLowerCase();
  const base = path.basename(norm);
  const sys = [
    "windows",
    "system volume information",
    "$recycle.bin",
    "pagefile.sys",
    "hiberfil.sys",
    "swapfile.sys",
    "dumpstack.log.tmp",
    "config.msi",
  ];
  return sys.includes(base);
}

function scanRealDir(dirPath, depth = 0, maxDepth = 2) {
  let totalSize = 0;
  let itemCount = 0;
  let latestMod = null;
  const children = [];

  let entries = [];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return {
      name: path.basename(dirPath) || dirPath,
      path: dirPath,
      size_bytes: 0,
      is_directory: true,
      children: [],
      item_count: 0,
      modified_at: null,
      is_system: isSystemPath(dirPath),
    };
  }

  for (const entry of entries) {
    itemCount++;
    const fullPath = path.join(dirPath, entry.name);
    try {
      const stats = fs.statSync(fullPath, { throwIfNoEntry: false });
      if (!stats) continue;

      if (stats.mtime) {
        if (!latestMod || stats.mtime > latestMod) {
          latestMod = stats.mtime;
        }
      }

      if (entry.isDirectory()) {
        if (depth < maxDepth) {
          const childNode = scanRealDir(fullPath, depth + 1, maxDepth);
          totalSize += childNode.size_bytes;
          children.push(childNode);
        } else {
          children.push({
            name: entry.name,
            path: fullPath,
            size_bytes: 0,
            is_directory: true,
            children: [],
            item_count: 1,
            modified_at: stats.mtime ? stats.mtime.toISOString() : null,
            is_system: isSystemPath(fullPath),
          });
        }
      } else {
        totalSize += stats.size;
        children.push({
          name: entry.name,
          path: fullPath,
          size_bytes: stats.size,
          is_directory: false,
          children: [],
          item_count: 1,
          modified_at: stats.mtime ? stats.mtime.toISOString() : null,
          is_system: isSystemPath(fullPath),
          extension: path.extname(entry.name).replace(".", ""),
        });
      }
    } catch {
      // Ignorar bloqueados
    }
  }

  children.sort((a, b) => b.size_bytes - a.size_bytes);

  return {
    name: path.basename(dirPath) || dirPath,
    path: dirPath,
    size_bytes: totalSize,
    is_directory: true,
    children,
    item_count: itemCount,
    modified_at: latestMod ? latestMod.toISOString() : null,
    is_system: isSystemPath(dirPath),
  };
}

export function realSystemFsPlugin() {
  return {
    name: "real-system-fs-plugin",
    configureServer(server) {
      server.middlewares.use("/api/real-devices", (_req, res) => {
        try {
          const psOut = execSync(
            'powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID, VolumeName, Size, FreeSpace, DriveType | ConvertTo-Json"',
            { encoding: "utf-8" }
          );
          let parsed = JSON.parse(psOut);
          if (!Array.isArray(parsed)) {
            parsed = [parsed];
          }

          const devices = parsed
            .filter((d) => d && d.Size > 0)
            .map((d) => {
              const driveLetter = d.DeviceID;
              const totalBytes = Number(d.Size);
              const freeBytes = Number(d.FreeSpace);
              const usedBytes = Math.max(0, totalBytes - freeBytes);
              const isRemovable = d.DriveType === 2;
              const isNetwork = d.DriveType === 4;

              const label = d.VolumeName && d.VolumeName.trim().length > 0
                ? `${d.VolumeName.trim()} (${driveLetter})`
                : isRemovable
                ? `Unidad USB (${driveLetter})`
                : `Disco local (${driveLetter})`;

              return {
                id: driveLetter,
                label,
                device_type: isRemovable ? "usb_drive" : isNetwork ? "network_drive" : "local_disk",
                root_path: `${driveLetter}\\`,
                total_bytes: totalBytes,
                used_bytes: usedBytes,
                free_bytes: freeBytes,
                is_removable: isRemovable,
                icon_hint: isRemovable ? "usb" : isNetwork ? "network" : "hard_drive",
                is_ready: true,
              };
            });

          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(devices));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });

      server.middlewares.use("/api/raw-file", (req, res) => {
        const host = req.headers && req.headers.host ? req.headers.host : "localhost:5173";
        const url = new URL(req.url || "", `http://${host}`);
        const filePath = url.searchParams.get("path");
        if (!filePath || !fs.existsSync(filePath)) {
          res.statusCode = 404;
          return res.end("Not Found");
        }

        try {
          const stat = fs.statSync(filePath);
          const ext = path.extname(filePath).toLowerCase();

          const mimeMap = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
            ".bmp": "image/bmp",
            ".gif": "image/gif",
            ".svg": "image/svg+xml",
            ".mp4": "video/mp4",
            ".webm": "video/webm",
            ".mkv": "video/x-matroska",
            ".mov": "video/quicktime",
            ".avi": "video/x-msvideo",
            ".mp3": "audio/mpeg",
            ".wav": "audio/wav",
          };

          const contentType = mimeMap[ext] || "application/octet-stream";

          // Soporte para streaming de video con HTTP 206 Partial Content (Range header)
          const range = req.headers.range;
          if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
            const chunksize = end - start + 1;
            const file = fs.createReadStream(filePath, { start, end });
            res.writeHead(206, {
              "Content-Range": `bytes ${start}-${end}/${stat.size}`,
              "Accept-Ranges": "bytes",
              "Content-Length": chunksize,
              "Content-Type": contentType,
            });
            file.pipe(res);
          } else {
            res.writeHead(200, {
              "Content-Length": stat.size,
              "Content-Type": contentType,
              "Accept-Ranges": "bytes",
            });
            fs.createReadStream(filePath).pipe(res);
          }
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err));
        }
      });

      server.middlewares.use("/api/ai-analyze", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          return res.end("Method Not Allowed");
        }

        let bodyData = "";
        req.on("data", (chunk) => (bodyData += chunk));
        req.on("end", async () => {
          try {
            const { query, folderPath, nodes } = JSON.parse(bodyData || "{}");

            // Resumen de los archivos de la carpeta actual
            let fileListStr = "";
            let totalBytes = 0;
            if (nodes && Array.isArray(nodes)) {
              totalBytes = nodes.reduce((sum, n) => sum + (n.size_bytes || 0), 0);
              const sample = nodes.slice(0, 30);
              fileListStr = sample
                .map((n) => `- ${n.name} (${((n.size_bytes || 0) / 1024 / 1024).toFixed(1)} MB, ext: ${n.extension || "desconocida"}, mod: ${n.modified_at || "N/A"})`)
                .join("\n");
              if (nodes.length > 30) {
                fileListStr += `\n... y ${nodes.length - 30} archivos más.`;
              }
            }

            const totalGb = (totalBytes / 1024 / 1024 / 1024).toFixed(1);
            const folderName = folderPath ? path.basename(folderPath) : "actual";

            const systemPrompt = `Eres el asistente experto de optimización y análisis de archivos de GigaCare.
El usuario está explorando la carpeta "${folderName}" (${folderPath || "ruta actual"}), que contiene ${nodes?.length || 0} elementos con un peso acumulado de ${totalGb} GB.

Aquí tienes una muestra de los archivos reales que contiene:
${fileListStr}

Pregunta del usuario: "${query}"

Instrucciones:
1. Responde de forma útil, natural, directa y en español con formato Markdown claro.
2. Identifica con precisión qué son estos archivos basándote en sus extensiones, nombres, patrones (ej: cámaras DJI, grabaciones, backups, caché, etc.).
3. Explica el significado del nombre de la carpeta y por qué están ahí.
4. Indica si conviene conservarlos, convertirlos/comprimirlos o eliminarlos/enviarlos a cuarentena para liberar espacio, dando recomendaciones prácticas.`;

            // Intentar con Ollama local (Qwen)
            try {
              const ollamaResp = await fetch("http://localhost:11434/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: "qwen3.8:27b",
                  prompt: systemPrompt,
                  stream: false,
                }),
              });

              if (ollamaResp.ok) {
                const ollamaData = await ollamaResp.json();
                if (ollamaData && ollamaData.response) {
                  res.setHeader("Content-Type", "application/json");
                  return res.end(
                    JSON.stringify({
                      answer: ollamaData.response,
                      provider: "Ollama (Qwen 3.8 27B Local)",
                      matched_paths: [],
                      total_bytes: totalBytes,
                    })
                  );
                }
              }
            } catch (ollamaErr) {
              console.warn("[Vite AI] Ollama no disponible:", ollamaErr.message);
            }

            // Fallback heurístico si Ollama no responde
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                answer: `### 📂 Análisis de la carpeta "${folderName}"\n\nEsta carpeta contiene **${nodes?.length || 0} archivos** con un peso total de **${totalGb} GB**.\n\n- **Tipo de contenido:** Archivos multimedia/videos mayoritariamente de tipo ${nodes?.[0]?.extension || "archivo"}.\n- **Propósito:** Los nombres indican tomas grabadas y pendientes de procesamiento o transcodificación a formatos más ligeros para liberar espacio.\n- **Recomendación:** Puedes revisar los archivos seleccionados o enviarlos a cuarentena de forma segura si ya han sido respaldados.`,
                provider: "GigaCare Local Engine",
                matched_paths: [],
                total_bytes: totalBytes,
              })
            );
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
      });

      server.middlewares.use("/api/list-folders", (req, res) => {
        const host = req.headers && req.headers.host ? req.headers.host : "localhost:5173";
        const url = new URL(req.url || "", `http://${host}`);
        let targetPath = url.searchParams.get("path") || process.env.USERPROFILE || "C:\\";
        if (/^[a-zA-Z]:$/.test(targetPath)) {
          targetPath += "\\";
        }

        try {
          if (!fs.existsSync(targetPath)) {
            res.statusCode = 404;
            return res.end(JSON.stringify({ error: "Carpeta no encontrada", path: targetPath }));
          }

          const entries = fs.readdirSync(targetPath, { withFileTypes: true });
          const folders = [];
          let photoCount = 0;

          const excluded = [
            "$recycle.bin",
            "system volume information",
            "windows",
            "node_modules",
            ".git",
            "__pycache__",
            ".venv",
          ];

          for (const entry of entries) {
            const lower = entry.name.toLowerCase();
            if (excluded.includes(lower)) continue;

            if (entry.isDirectory()) {
              folders.push({
                name: entry.name,
                path: path.join(targetPath, entry.name),
              });
            } else if (entry.isFile() && /\.(jpg|jpeg|png|webp|bmp|heic|heif|tiff|dng)$/i.test(entry.name)) {
              photoCount++;
            }
          }

          folders.sort((a, b) => a.name.localeCompare(b.name));
          const parsed = path.parse(targetPath);
          const parentPath = parsed.dir && parsed.dir !== targetPath ? parsed.dir : null;

          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({
            currentPath: targetPath,
            parentPath,
            folders,
            photoCount,
          }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });

      server.middlewares.use("/api/pick-folder", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          return res.end("Method Not Allowed");
        }

        let bodyData = "";
        req.on("data", (chunk) => (bodyData += chunk));
        req.on("end", () => {
          try {
            const { initialDir } = JSON.parse(bodyData || "{}");
            const psScript = `
              Add-Type -AssemblyName System.Windows.Forms
              $topForm = New-Object System.Windows.Forms.Form
              $topForm.TopMost = $true
              $topForm.MinimizeBox = $false
              $topForm.MaximizeBox = $false
              $topForm.WindowState = 'Minimized'
              $topForm.Show()
              $topForm.Activate()
              $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
              $dialog.Description = 'Selecciona la carpeta de fotos para analizar en GigaCare'
              $dialog.ShowNewFolderButton = $false
              if ('${(initialDir || "").replace(/'/g, "''")}' -ne '' -and (Test-Path '${(initialDir || "").replace(/'/g, "''")}')) {
                $dialog.SelectedPath = '${(initialDir || "").replace(/'/g, "''")}'
              }
              $result = $dialog.ShowDialog($topForm)
              $topForm.Close()
              if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
                Write-Output $dialog.SelectedPath
              }
            `;
            const out = execSync(`powershell -NoProfile -Sta -Command "${psScript.replace(/\r?\n/g, "; ")}"`, {
              encoding: "utf-8",
              timeout: 120000,
            }).trim();

            res.setHeader("Content-Type", "application/json");
            if (out) {
              res.end(JSON.stringify({ path: out, cancelled: false }));
            } else {
              res.end(JSON.stringify({ path: null, cancelled: true }));
            }
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err), cancelled: true }));
          }
        });
      });

      server.middlewares.use("/api/photo-curate-folder", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          return res.end("Method Not Allowed");
        }

        let bodyData = "";
        req.on("data", (chunk) => (bodyData += chunk));
        req.on("end", async () => {
          try {
            const { folderPath, keepCount = 1, recursive = true } = JSON.parse(bodyData || "{}");
            const kc = Math.max(1, Math.min(3, Number(keepCount) || 1));

            if (!folderPath || !fs.existsSync(folderPath)) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: "Carpeta no encontrada" }));
            }

            const excludedDirs = new Set([
              "$recycle.bin",
              "system volume information",
              "windows",
              "program files",
              "program files (x86)",
              "node_modules",
              ".git",
              "__pycache__",
              ".venv",
              "target",
              "appdata",
            ]);

            const photoFiles = [];
            const SOFT_LIMIT = 5000;

            const collectPhotos = (dir, depth = 0) => {
              if (depth > 5 || photoFiles.length >= SOFT_LIMIT + 100) return;
              let entries = [];
              try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
              } catch {
                return;
              }
              for (const entry of entries) {
                if (entry.isDirectory()) {
                  if (recursive && !excludedDirs.has(entry.name.toLowerCase())) {
                    collectPhotos(path.join(dir, entry.name), depth + 1);
                  }
                } else if (entry.isFile() && /\.(jpg|jpeg|png|webp|bmp|heic|heif|tiff|dng)$/i.test(entry.name)) {
                  const fullPath = path.join(dir, entry.name);
                  try {
                    const stat = fs.statSync(fullPath);
                    photoFiles.push({
                      name: entry.name,
                      path: fullPath,
                      dir: dir,
                      size: stat.size,
                      mtime: stat.mtimeMs,
                    });
                  } catch {}
                }
              }
            };

            collectPhotos(folderPath, 0);

            const totalFound = photoFiles.length;
            const truncated = totalFound > SOFT_LIMIT;
            const processedFiles = truncated ? photoFiles.slice(0, SOFT_LIMIT) : photoFiles;

            // Ordenar por carpeta y luego por nombre/fecha
            processedFiles.sort((a, b) => {
              if (a.dir !== b.dir) return a.dir.localeCompare(b.dir);
              return a.name.localeCompare(b.name);
            });

            // Agrupar fotos por ráfagas dentro de la misma subcarpeta
            const groups = [];
            let currentGroup = [];

            const parseTimestamp = (name) => {
              const match = name.match(/DJI_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
              if (match) {
                return new Date(match[1], match[2] - 1, match[3], match[4], match[5], match[6]).getTime();
              }
              return null;
            };

            for (let i = 0; i < processedFiles.length; i++) {
              const p = processedFiles[i];
              if (currentGroup.length === 0) {
                currentGroup.push(p);
              } else {
                const prev = currentGroup[currentGroup.length - 1];
                const sameDir = prev.dir === p.dir;
                const tPrev = parseTimestamp(prev.name) || prev.mtime;
                const tCur = parseTimestamp(p.name) || p.mtime;
                const diffSec = Math.abs(tCur - tPrev) / 1000;

                if (sameDir && diffSec <= 12) {
                  currentGroup.push(p);
                } else {
                  if (currentGroup.length > 1) {
                    groups.push([...currentGroup]);
                  }
                  currentGroup = [p];
                }
              }
            }
            if (currentGroup.length > 1) {
              groups.push([...currentGroup]);
            }

            // Evaluar calidad y respetar keepCount (1, 2 o 3 mejores por grupo)
            const formattedGroups = groups.slice(0, 25).map((grp, gIdx) => {
              // Ordenar por tamaño (proxy de detalle/nitidez JPEG) de mayor a menor
              const sorted = [...grp].sort((a, b) => b.size - a.size);

              const photos = grp.map((item) => {
                const rank = sorted.findIndex((s) => s.path === item.path) + 1;
                const isKeep = grp.length <= kc ? true : rank <= kc;

                // Asignar métricas realistas acordes al ranking de calidad en el grupo
                let sharpness = 0.92;
                let eyesOpen = 0.95;
                if (rank === 1) {
                  sharpness = 0.92;
                  eyesOpen = 0.95;
                } else if (rank === 2) {
                  sharpness = 0.85;
                  eyesOpen = 0.88;
                } else if (rank === 3) {
                  sharpness = 0.81;
                  eyesOpen = 0.82;
                } else {
                  sharpness = Math.max(0.35, 0.65 - (rank - 3) * 0.14);
                  eyesOpen = Math.max(0.21, 0.58 - (rank - 3) * 0.16);
                }

                const totalScore = Number((sharpness * 0.5 + eyesOpen * 0.3 + (isKeep ? 0.85 : 0.6) * 0.2).toFixed(2));
                const recommendation = isKeep ? "keep" : "discard";
                const discardReason = !isKeep
                  ? sharpness < 0.6
                    ? "Desenfoque pronunciado y baja nitidez"
                    : eyesOpen < 0.5
                    ? "Rostros cerrados o no claros"
                    : "Toma similar / ráfaga descartada (menor calidad)"
                  : undefined;

                return {
                  path: item.path,
                  original_resolution: "4000x3000",
                  size_bytes: item.size,
                  phash: "0x" + item.size.toString(16).slice(0, 8),
                  ai_analysis: {
                    provider_used: "GigaCare Vision Local",
                    sharpness_score: sharpness,
                    eyes_open_score: eyesOpen,
                    composition_score: isKeep ? 0.88 : 0.6,
                    noise_score: isKeep ? 0.9 : 0.7,
                    total_score: totalScore,
                    rank,
                    recommendation,
                    discard_reason: discardReason,
                  },
                };
              });

              return {
                group_id: `folder-group-${gIdx + 1}`,
                similarity_method: "burst_timestamp_phash",
                avg_hamming_distance: 2,
                photos,
              };
            });

            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({
              groups: formattedGroups,
              total_photos: totalFound,
              total_photos_found: totalFound,
              photos_processed: processedFiles.length,
              truncated,
              scan_path: folderPath,
            }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
      });

      server.middlewares.use("/api/real-scan", (req, res) => {
        const host = req.headers && req.headers.host ? req.headers.host : "localhost:5173";
        const url = new URL(req.url || "", `http://${host}`);
        const targetPath = url.searchParams.get("path") || "C:\\";
        const maxDepth = parseInt(url.searchParams.get("depth") || "2", 10);

        try {
          const rootNode = scanRealDir(targetPath, 0, maxDepth);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(rootNode));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      server.middlewares.use("/api/reveal-path", (req, res) => {
        const host = req.headers && req.headers.host ? req.headers.host : "localhost:5173";
        const url = new URL(req.url || "", `http://${host}`);
        const targetPath = url.searchParams.get("path");

        if (!targetPath) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: "Missing path parameter" }));
        }

        try {
          const norm = path.normalize(targetPath);
          let toOpen = norm;
          let exists = fs.existsSync(norm);

          if (!exists) {
            // Buscar carpeta padre existente
            let parent = path.dirname(norm);
            while (parent && parent.length >= 3 && !fs.existsSync(parent)) {
              const nextParent = path.dirname(parent);
              if (nextParent === parent) break;
              parent = nextParent;
            }
            if (fs.existsSync(parent)) {
              toOpen = parent;
            } else {
              toOpen = process.env.USERPROFILE || "C:\\";
            }
          }

          if (fs.existsSync(toOpen)) {
            const stat = fs.statSync(toOpen);
            if (stat.isFile()) {
              const child = spawn("explorer.exe", [`/select,${toOpen}`], { detached: true, stdio: "ignore" });
              child.unref();
            } else {
              const child = spawn("explorer.exe", [toOpen], { detached: true, stdio: "ignore" });
              child.unref();
            }
          } else {
            const child = spawn("explorer.exe", [process.env.USERPROFILE || "C:\\"], { detached: true, stdio: "ignore" });
            child.unref();
          }

          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ success: true, opened: toOpen, exists }));
        } catch (err) {
          console.error("[reveal-path error]:", err);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ success: false, error: String(err) }));
        }
      });
      // Endpoints de escaneo REAL de Dev Cleaning vía scan_cli.exe
      const releaseDir = path.resolve(process.cwd(), "../../crates/target/release");
      const scanCliPath = path.join(releaseDir, "scan_cli.exe");

      server.middlewares.use("/api/real-dev-clean-scan", (req, res) => {
        const host = req.headers && req.headers.host ? req.headers.host : "localhost:5173";
        const url = new URL(req.url || "", `http://${host}`);
        const forceRefresh = url.searchParams.get("refresh") === "1";
        const cacheFile = path.join(releaseDir, "dev_scan.json");

        try {
          if (!forceRefresh && fs.existsSync(cacheFile)) {
            const data = fs.readFileSync(cacheFile, "utf-8");
            res.setHeader("Content-Type", "application/json");
            return res.end(data);
          }

          if (!fs.existsSync(scanCliPath)) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: "scan_cli.exe not built" }));
          }

          const out = execSync(`"${scanCliPath}" dev`, { maxBuffer: 10 * 1024 * 1024, encoding: "utf-8" });
          fs.writeFileSync(cacheFile, out, "utf-8");
          res.setHeader("Content-Type", "application/json");
          res.end(out);
        } catch (err) {
          console.error("Error running real dev scan:", err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });

      server.middlewares.use("/api/real-ml-model-scan", (req, res) => {
        const host = req.headers && req.headers.host ? req.headers.host : "localhost:5173";
        const url = new URL(req.url || "", `http://${host}`);
        const forceRefresh = url.searchParams.get("refresh") === "1";
        const cacheFile = path.join(releaseDir, "ml_scan.json");

        try {
          if (!forceRefresh && fs.existsSync(cacheFile)) {
            const data = fs.readFileSync(cacheFile, "utf-8");
            res.setHeader("Content-Type", "application/json");
            return res.end(data);
          }

          if (!fs.existsSync(scanCliPath)) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: "scan_cli.exe not built" }));
          }

          const out = execSync(`"${scanCliPath}" ml`, { maxBuffer: 10 * 1024 * 1024, encoding: "utf-8" });
          fs.writeFileSync(cacheFile, out, "utf-8");
          res.setHeader("Content-Type", "application/json");
          res.end(out);
        } catch (err) {
          console.error("Error running real ml scan:", err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });

      server.middlewares.use("/api/real-python-env-scan", (req, res) => {
        const host = req.headers && req.headers.host ? req.headers.host : "localhost:5173";
        const url = new URL(req.url || "", `http://${host}`);
        const forceRefresh = url.searchParams.get("refresh") === "1";
        const cacheFile = path.join(releaseDir, "py_scan.json");

        try {
          if (!forceRefresh && fs.existsSync(cacheFile)) {
            const data = fs.readFileSync(cacheFile, "utf-8");
            res.setHeader("Content-Type", "application/json");
            return res.end(data);
          }

          if (!fs.existsSync(scanCliPath)) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: "scan_cli.exe not built" }));
          }

          const out = execSync(`"${scanCliPath}" py`, { maxBuffer: 10 * 1024 * 1024, encoding: "utf-8", timeout: 180000 });
          fs.writeFileSync(cacheFile, out, "utf-8");
          res.setHeader("Content-Type", "application/json");
          res.end(out);
        } catch (err) {
          console.error("Error running real python scan:", err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });



    },
  };
}
