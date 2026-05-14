/**
 * Color palette.
 *
 * The 8 factor colors deliberately follow the WJP visual convention seen in
 * the official ROLI publications: each factor has a stable signature color
 * (teal, olive, teal-blue, slate, purple, green, orange, red). Don't change
 * these without coordinating with whoever produced the prior charts —
 * readers recognize the categories by color.
 */
export const FACTOR_COLORS = {
  f1: '#2a6a6f', // dark teal — Constraints on Government Powers
  f2: '#9bbf3f', // olive green — Absence of Corruption
  f3: '#2f8a9c', // teal-blue — Open Government
  f4: '#6b8194', // slate blue — Fundamental Rights
  f5: '#7a2dc4', // purple — Order and Security
  f6: '#3d8b48', // forest green — Regulatory Enforcement
  f7: '#d68b1f', // orange — Civil Justice
  f8: '#c0392b', // red — Criminal Justice
};

/**
 * UI theme. Editorial / minimal: a serif display face for headlines paired
 * with a precise grotesque for everything functional. Avoids the standard
 * "Inter on white" dashboard look.
 */
export const COLORS = {
  bg: '#faf8f3',
  surface: '#ffffff',
  border: '#e6e2d8',
  ink: '#1a1a1a',
  inkSoft: '#3a3a3a',
  text: '#222222',
  muted: '#7a7a7a',
  track: '#ece8de', // bar background track
  accent: '#1a1a1a', // primary action color
  accentText: '#faf8f3',
};

export const FONTS = {
  // Single typeface across the whole product. Inter Tight is a tighter
  // grotesque variant of Inter — same UI legibility but with a sharper
  // editorial feel at display sizes.
  display: '"Inter Tight", -apple-system, BlinkMacSystemFont, sans-serif',
  sans: '"Inter Tight", -apple-system, BlinkMacSystemFont, sans-serif',
};
