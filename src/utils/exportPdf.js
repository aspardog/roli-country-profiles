/**
 * Multi-country PDF export.
 *
 * Builds one SVG per country and embeds each as a single PDF page.
 * jsPDF + svg2pdf.js handle the SVG→PDF conversion. We use landscape A4
 * because the profile chart is ~1.6× wider than tall.
 *
 * Note: Both jsPDF and svg2pdf.js are imported lazily so the heavy code
 * is only loaded when the user actually requests a PDF. Vite will split
 * these into a separate chunk (see vite.config.js manualChunks).
 */
import { buildProfileSvg, getSvgDimensions } from './svgBuilder.js';
import { registerInterTightFonts } from './fonts.js';

function sanitizeFilename(name) {
  return String(name).trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_-]/g, '');
}

/**
 * Generate a PDF containing one page per country.
 *
 * @param {Array<{profile: object, title: string}>} entries - List of country
 *   entries to include, in the order they should appear in the PDF.
 * @param {object} options
 * @param {string} options.filename - Output filename (without extension).
 * @param {number|string} options.year - Year label embedded in each page.
 * @param {(progress: {current: number, total: number}) => void} [options.onProgress]
 *   Optional callback invoked after each page is rendered.
 */
export async function exportCountriesPdf(entries, { filename, year, onProgress } = {}) {
  if (!entries?.length) throw new Error('No entries provided');

  // Lazy imports so this code path is only paid for when used.
  const { default: jsPDF } = await import('jspdf');
  const { svg2pdf } = await import('svg2pdf.js');

  const { width, height } = getSvgDimensions(true);

  // jsPDF expects dimensions in its declared unit; we use points (pt).
  // Convert our SVG pixel dimensions to points at 72 dpi-equivalent: keep
  // 1:1 mapping (SVG units == points). The resulting page is generously
  // sized but jsPDF handles arbitrary page dimensions cleanly.
  const pdf = new jsPDF({
    orientation: width >= height ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [width, height],
    compress: true,
  });

  // Register Inter Tight fonts so PDF text matches the web UI
  await registerInterTightFonts(pdf);

  for (let i = 0; i < entries.length; i++) {
    const { profile, title } = entries[i];
    const svg = buildProfileSvg(profile, title, year);

    // svg2pdf needs the element in the document tree to resolve computed
    // styles. We attach it off-screen, render, then remove.
    const sandbox = document.createElement('div');
    sandbox.style.position = 'absolute';
    sandbox.style.left = '-99999px';
    sandbox.style.top = '-99999px';
    sandbox.style.pointerEvents = 'none';
    sandbox.appendChild(svg);
    document.body.appendChild(sandbox);

    try {
      if (i > 0) pdf.addPage([width, height], width >= height ? 'landscape' : 'portrait');
      await svg2pdf(svg, pdf, { x: 0, y: 0, width, height });
    } finally {
      document.body.removeChild(sandbox);
    }

    if (onProgress) onProgress({ current: i + 1, total: entries.length });
  }

  // Add page numbers centered at the bottom of each page
  const totalPages = entries.length;
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFont('Inter Tight', 'normal', 400);
    pdf.setFontSize(12);
    pdf.setTextColor(122, 122, 122); // muted gray (#7a7a7a)
    const pageText = `${i} / ${totalPages}`;
    pdf.text(pageText, width / 2, height - 24, { align: 'center' });
  }

  pdf.save(`${sanitizeFilename(filename)}.pdf`);
}
