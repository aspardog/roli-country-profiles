# Project: ROLI Country Profiles

Aplicación estática en `React + Vite` para explorar y exportar perfiles país del
**World Justice Project Rule of Law Index**. El repo también incluye el parser
que transforma el Excel oficial de WJP en el JSON que consume la UI.

## Estado actual

- Runtime dataset: `public/data/roli.json`
- Artifact versionado espejo: `data/roli.json`
- Año actual del payload: `2025`
- Año comparativo del payload: `2024`
- Países en el dataset actual: `143`
- El JSON ahora incluye `averages.global` y `averages.regional`
- Stack frontend: `React 18`, `Vite 5`
- Export: `jsPDF`, `svg2pdf.js`
- Python env: `uv` + `pyproject.toml` + `uv.lock`
- Testing: no existe suite automatizada

## Mapa real del código

- `src/App.jsx`
  Orquestador principal. Maneja selección de región/país, estado de exportación y panel About.

- `src/hooks/useRoliData.js`
  Carga `public/data/roli.json` con `fetch()` una sola vez.

- `src/components/ControlPanel.jsx`
  Toolbar con selectores y acciones de exportación.

- `src/components/CountryProfileChart.jsx`
  Renderer React del perfil visible en pantalla.

- `src/components/StatsCard.jsx`
  Tabla superior con ranks y cambios interanuales para países reales.

- `src/utils/filters.js`
  Helpers puros para filtrar países y resolver la selección actual.
  Importante: ya no calcula promedios; usa los precomputados en el JSON.

- `src/utils/svgBuilder.js`
  Renderer SVG standalone usado por SVG download y PDF export.

- `src/utils/exportSvg.js`
  Descarga el perfil visible como `.svg`.

- `src/utils/exportPdf.js`
  Genera un PDF multipágina con todos los países en orden alfabético.

- `src/utils/fonts.js`
  Carga los `.ttf` desde `public/fonts/` y registra Inter Tight en jsPDF.

- `src/config/structure.js`
  Fuente de verdad de factores, subfactores y regiones.

- `src/config/labels.js`
  Labels de factores y subfactores.

- `src/config/colors.js`
  Paleta, colores por factor y familias tipográficas.

- `scripts/parse-roli-data.py`
  Parser del Excel WJP. Detecta workbook, hoja más reciente, hoja previa,
  filas relevantes, estadísticas derivadas y promedios agregados.

- `vercel.json`
  Rewrites SPA, CSP, headers y políticas de caché.

## Flujo de datos real

```text
Excel WJP (.xlsx)
  -> scripts/parse-roli-data.py
  -> data/roli.json
  -> public/data/roli.json
  -> useRoliData()
  -> App state
  -> resolveSelection()
  -> CountryProfileChart (pantalla)
  -> svgBuilder/exportSvg (SVG)
  -> buildPdfEntries/exportPdf (PDF)
```

## Contratos importantes

### 1. El JSON es la fuente de verdad

La UI asume este shape top-level:

- `year`
- `previousYear`
- `sourceSheet`
- `sourceFile`
- `averages`
- `countries`

`averages` debe incluir:

- `global`
- `regional`

Cada país debe incluir:

- `country`, `code`, `region`, `income`
- `overall`
- `f1..f8`
- `sf11..sf87`
- `globalRank`, `globalTotal`
- `regionalRank`, `regionalTotal`
- `incomeRank`, `incomeTotal`
- `globalRankChange`, `scoreChange`, `pctChange`

Si cambia el shape del parser, revisar:

- `src/hooks/useRoliData.js`
- `src/utils/filters.js`
- `src/components/StatsCard.jsx`
- `src/components/CountryProfileChart.jsx`
- `src/utils/svgBuilder.js`

### 2. Los promedios ya no se calculan en frontend

`Global Average` y `Regional Average` deben salir de `data.averages`.
Si faltan, la UI mostrará `null` para esa selección en lugar de recalcular.

### 3. `src/config/` es la fuente de verdad semántica

Si WJP cambia la estructura del índice, actualizar en conjunto:

- `src/config/structure.js`
- `src/config/labels.js`
- `src/config/colors.js` si cambian semánticas visuales

Tanto el renderer React como el SVG exportado iteran sobre esa configuración.

### 4. Pantalla y export son renderers separados

Hay dos implementaciones visuales distintas:

- pantalla: `src/components/CountryProfileChart.jsx`
- export: `src/utils/svgBuilder.js`

Cambios de layout deben replicarse en ambos lados.

### 5. El PDF ignora el filtro regional

`buildPdfEntries()` siempre devuelve todos los países, ordenados alfabéticamente.
Eso es deliberado. El filtro regional solo afecta lo visible en pantalla.

## Seguridad práctica

- No hay backend.
- No hay autenticación.
- No hay cookies.
- No hay `localStorage`.
- No hay analytics.
- No usar `dangerouslySetInnerHTML`, `eval`, `new Function`.
- No introducir requests runtime a terceros sin revisar primero la CSP en `vercel.json`.

### Riesgos conocidos hoy

- `npm audit` reporta vulnerabilidades moderadas/críticas transitivas en `jspdf`
  y `vite` vía `dompurify` y `esbuild`. Los fixes automáticos hoy implican cambios
  breaking (`jspdf@4` y `vite@8`), así que cualquier remediación debe probar export
  PDF y entorno de desarrollo antes de actualizar.

## Comandos útiles

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run lint`
- `npm run parse-data`
- `npm run audit`

## Reglas de mantenimiento

### Si cambias datos

1. Actualiza el Excel en `data/`.
2. Ejecuta `npm run parse-data`.
3. Verifica `data/roli.json` y `public/data/roli.json`.
4. Revisa que existan `averages.global` y `averages.regional`.
5. Valida UI, SVG y PDF.

### Si cambias layout

1. Actualiza `CountryProfileChart.jsx`.
2. Replica el ajuste en `svgBuilder.js`.
3. Verifica SVG export.
4. Verifica PDF export.

### Si cambias fuentes o assets

1. Revisa `src/config/colors.js`.
2. Revisa `src/utils/fonts.js`.
3. Revisa CSP en `vercel.json`.
4. Genera un PDF real para validar embedding.

## Nota de contexto

`README.md` es la documentación para humanos externos. Este archivo debe servir
como mapa operativo corto para trabajo dentro del repo. Si ambos divergen,
priorizar el código, luego este contexto, y después actualizar el README.
