# Project: ROLI Country Profiles

Aplicación React/Vite para explorar perfiles país del **World Justice Project Rule of Law Index 2025**. La UI muestra un perfil individual o un promedio regional/global, y permite exportar el perfil visible a SVG o exportar **todos los países** a un PDF multipágina.

## Estado actual del repo

- Dataset servido en runtime: `public/data/roli.json`
- Año actual detectado en el payload: `2025`
- Países en el dataset actual: `143`
- Stack: `React 18`, `Vite 5`, `jsPDF`, `svg2pdf.js`
- Estilos: inline styles + tokens compartidos en `src/config/`
- Testing: no hay suite automatizada

## Mapa rápido del código

- `src/App.jsx`
  Orquestador principal. Maneja estado de región, selección, panel About, errores de exportación y progreso del PDF.

- `src/hooks/useRoliData.js`
  Carga `public/data/roli.json` una sola vez. El año viene del JSON; no debe hardcodearse en la app.

- `src/components/ControlPanel.jsx`
  Toolbar con selectores de región/país y botones de exportación.

- `src/components/CountryProfileChart.jsx`
  Implementación React del gráfico en pantalla.

- `src/utils/filters.js`
  Helpers puros para filtrar por región, calcular promedios y resolver la selección actual.

- `src/utils/svgBuilder.js`
  Genera el SVG standalone usado por exportación.

- `src/utils/exportSvg.js`
  Descarga el perfil visible como archivo `.svg`.

- `src/utils/exportPdf.js`
  Genera un PDF con una página por país. Usa imports lazy de `jspdf` y `svg2pdf.js`.

- `src/utils/fonts.js`
  Carga los `.ttf` desde `public/fonts/` y registra Inter Tight en jsPDF.

- `src/config/structure.js`
  Fuente de verdad de factores, subfactores y regiones.

- `src/config/labels.js`
  Labels editoriales de factores y subfactores.

- `src/config/colors.js`
  Paleta, colores por factor y familias tipográficas.

- `scripts/parse-roli-data.py`
  Parser del Excel WJP. Detecta el archivo, la hoja más reciente y el layout por labels.

- `vercel.json`
  Configuración de SPA rewrite, CSP, headers de seguridad y caching.

## Flujo de datos real

```text
Excel WJP (.xlsx)
  -> scripts/parse-roli-data.py
  -> data/roli.json
  -> public/data/roli.json
  -> useRoliData()
  -> App state (region, selectedCode)
  -> resolveSelection()
  -> CountryProfileChart (pantalla)
  -> svgBuilder/exportSvg (SVG visible)
  -> buildPdfEntries/exportPdf (PDF de todos los países)
```

## Contratos importantes

### 1. El payload JSON manda

La UI asume este shape base:

- metadatos: `year`, `sourceSheet`, `sourceFile`
- `countries`: array de registros
- por país: `country`, `code`, `region`, `income`, `overall`, `f1..f8`, `sf11..sf87`

Si cambia el shape del parser, hay que revisar:

- `src/hooks/useRoliData.js`
- `src/utils/filters.js`
- `src/components/CountryProfileChart.jsx`
- `src/utils/svgBuilder.js`

### 2. `src/config/` es la fuente de verdad semántica

Si cambia la estructura del índice WJP, actualizar en conjunto:

- `src/config/structure.js`
- `src/config/labels.js`
- `src/config/colors.js` si hay cambios visuales asociados

Tanto el chart React como el SVG exportado iteran sobre esa configuración.

### 3. Pantalla y export no comparten renderer

Hay dos implementaciones visuales distintas:

- pantalla: `CountryProfileChart.jsx`
- export: `svgBuilder.js`

Cambios de contenido y semántica deben pasar por `src/config/`.
Cambios de layout fino deben replicarse en ambos lados.

### 4. El PDF ignora el filtro regional

`buildPdfEntries()` siempre devuelve **todos los países**, ordenados alfabéticamente.
Eso es deliberado. El filtro de región solo afecta la UI visible.

### 5. La selección regional siempre vuelve al promedio

Cuando cambia `region`, `App.jsx` resetea `selectedCode` a `REGIONAL_AVG_KEY`.
Esto evita estados inválidos donde queda seleccionado un país fuera de la región activa.

## Exportaciones

### SVG

- Exporta exactamente el perfil actualmente visible.
- El nombre del archivo pasa por `sanitizeFilename()`.
- No depende de librerías externas; usa `Blob` + `URL.createObjectURL`.

### PDF

- Un país por página.
- Orden alfabético.
- No incluye promedios regionales ni globales.
- Carga `jspdf` y `svg2pdf.js` solo al hacer clic.
- Registra fuentes Inter Tight desde `public/fonts/`.
- `svg2pdf.js` requiere montar el SVG en el DOM; por eso existe el sandbox off-screen en `exportPdf.js`.
- Añade numeración al pie después de renderizar todas las páginas.

## Estilo y UI

- Fondo papel claro con textura sutil en `src/index.css`
- Tipografía única: `Inter Tight`
- La app usa principalmente inline styles y constantes compartidas
- No hay sistema CSS modular ni componentes de diseño externos

## Seguridad y despliegue

- Deploy previsto: `Vercel`
- `vercel.json` configura rewrite SPA a `index.html`
- CSP actual:
  - permite `script-src 'self' 'unsafe-inline'`
  - permite `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`
  - permite `font-src 'self' https://fonts.gstatic.com data:`
  - permite `img-src 'self' data: blob:`
  - `connect-src 'self'`

Restricciones prácticas:

- evitar `eval`, `new Function`, `dangerouslySetInnerHTML`
- no introducir dependencias que requieran conexiones a terceros en runtime
- cualquier cambio en assets inline/data URI debe seguir siendo compatible con la CSP

## Parser de datos

`scripts/parse-roli-data.py` hace estas suposiciones:

- encuentra el Excel en `data/`
- busca hojas con patrón `WJP ROL Index <YYYY> Scores`
- detecta filas por etiquetas, no por índices fijos
- escribe dos salidas:
  - `data/roli.json`
  - `public/data/roli.json`

Si no existe `data/`, el parser la crea al escribir.

Riesgo principal: si WJP cambia significativamente los nombres de hoja o labels de filas, fallará la detección automática.

## Comandos útiles

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run lint`
- `npm run parse-data`

## Riesgos y puntos de mantenimiento

- No hay tests; cualquier refactor de `filters.js`, parser o exportación requiere validación manual.
- El chart React y el SVG exportado pueden desalinearse visualmente si solo se modifica uno.
- `README.md` puede quedar desactualizado respecto al comportamiento real; priorizar código y este contexto.
- `settings.local.json` incluye permisos amplios de shell; no asumir que son parte del producto, solo del entorno de trabajo.

## Checklist para cambios futuros

### Si cambias datos o estructura del índice

1. Actualiza el Excel fuente.
2. Ejecuta `npm run parse-data`.
3. Verifica `public/data/roli.json`.
4. Revisa `src/config/structure.js` y `labels.js`.
5. Valida UI, SVG y PDF.

### Si cambias layout visual

1. Actualiza `CountryProfileChart.jsx`.
2. Replica en `svgBuilder.js`.
3. Verifica export SVG.
4. Verifica export PDF.

### Si cambias fuentes o assets

1. Revisa `src/config/colors.js`
2. Revisa `src/utils/fonts.js`
3. Verifica CSP en `vercel.json`
4. Genera un PDF real para confirmar embedding
