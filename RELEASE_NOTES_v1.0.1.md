# GigaCare v1.0.1 — Overhaul UX de SpaceMap/SpaceLens, Treemap/Sunburst, Curador IA y DevCleaning 🚀

¡Bienvenido a **GigaCare v1.0.1**! Esta versión incorpora las actualizaciones desarrolladas para el explorador visual **SpaceMap / SpaceLens**, motores de visualización jerárquica **Treemap** y **Sunburst**, soporte nativo **MTP** para teléfonos y cámaras USB, el nuevo módulo **DevCleaning** y mejoras profundas en el **Curador de Fotos y Videos con IA**.

---

## 🌟 Novedades Principales en v1.0.1

### 1. Overhaul UX de SpaceMap / SpaceLens
- **Arquitectura Unificada de 4 Zonas:** Barra superior con historial de navegación (**Atrás ◀ / Adelante ▶**), panel lateral de archivos filtrable, lienzo central interactivo y barra de estado de impacto de limpieza estilo CleanMyMac.
- **Visualizaciones Interactivas Sincronizadas en Vivo:**
  - **Treemap (Squarified):** Mapa de bloques jerárquico de alto rendimiento (`gigacare-treemap`).
  - **Sunburst (Radial):** Anillos concéntricos proporcionales con drill-down multinivel.
  - **SpaceLens Bubbles:** Burbujas proporcionales con previsualización instantánea.
  - Sincronización en tiempo real entre el filtro de selección (*Todos*, *Seleccionados*, *No seleccionados*), los checkboxes de archivos y los nodos visuales del lienzo.
- **Consultas en Lenguaje Natural (`SpaceMapNLBar`):** Búsqueda inteligente asistida por IA sobre el árbol de almacenamiento.
- **Inspector de Archivos y Barra de Ahorro (`SavingsBar`):** Metadatos detallados, sugerencias adaptativas de limpieza, triaje de duplicados y pestaña de Cuarentena integrada.
- **Detección Nativa de Dispositivos MTP (WPD COM) y Selector de Carpetas:** Exploración de smartphones Android y cámaras conectadas por USB en Windows 11/10.

### 2. Curador de Fotos y Videos con IA
- **Rediseño Visual:** Indicadores circulares `QualityRing` y barras `MetricBar` para nitidez, exposición y composición.
- **Persistencia de `keep_count`:** Configuración persistente para conservar automáticamente las **1, 2 o 3 mejores tomas** de cada ráfaga.
- **Detección de Videos Similares (`video_hasher`):** Escaneo perceptual de secuencias de video duplicadas o similares en SmartCare.

### 3. Nuevos Crates y Módulos Nativos en Rust
- **`gigacare-treemap`:** Algoritmos Squarified Treemap y Sunburst jerárquicos.
- **`gigacare-devcleaning`:** Escaneo y limpieza de cachés de desarrollo (`node_modules`, `target`), modelos locales de IA/ML y entornos virtuales de Python.
- **`gigacare-registry`:** Gestión segura de programas de inicio de Windows (`StartupPanel`) y desinstalador profundo con barrido de residuos (`UninstallerPanel`).

### 4. Calidad y Suite de Pruebas
- **106 Tests Automatizados (41 suites):** Cobertura integral con Vitest y React Testing Library para flujos E2E, SpaceLens, Treemap, Sunburst, Curador de Fotos y Cuarentena.
