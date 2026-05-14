/**
 * Font registration for jsPDF.
 *
 * Loads Inter Tight font files and registers them with jsPDF so that
 * exported PDFs use the same typography as the web UI.
 */

// jsPDF requires TTF format (WOFF2 is not supported)
const FONT_FILES = {
  regular: '/fonts/InterTight-Regular.ttf',
  semibold: '/fonts/InterTight-SemiBold.ttf',
  bold: '/fonts/InterTight-Bold.ttf',
};

/**
 * Convert an ArrayBuffer to a base64 string.
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Fetch a font file and convert it to base64.
 */
async function loadFontAsBase64(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load font: ${url}`);
  }
  const buffer = await response.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

/**
 * Register Inter Tight fonts with a jsPDF instance.
 *
 * This must be called before rendering text that uses Inter Tight.
 * The fonts are loaded lazily to avoid blocking page load.
 *
 * @param {jsPDF} pdf - The jsPDF instance to register fonts with.
 */
export async function registerInterTightFonts(pdf) {
  const [regular, semibold, bold] = await Promise.all([
    loadFontAsBase64(FONT_FILES.regular),
    loadFontAsBase64(FONT_FILES.semibold),
    loadFontAsBase64(FONT_FILES.bold),
  ]);

  // Register each weight. jsPDF uses fontName + fontStyle to match fonts.
  // We use "InterTight" as the font name to match our SVG font-family.
  pdf.addFileToVFS('InterTight-Regular.ttf', regular);
  pdf.addFont('InterTight-Regular.ttf', 'Inter Tight', 'normal', 400);

  pdf.addFileToVFS('InterTight-SemiBold.ttf', semibold);
  pdf.addFont('InterTight-SemiBold.ttf', 'Inter Tight', 'normal', 600);

  pdf.addFileToVFS('InterTight-Bold.ttf', bold);
  pdf.addFont('InterTight-Bold.ttf', 'Inter Tight', 'bold', 700);
}
