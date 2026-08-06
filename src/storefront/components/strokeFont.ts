/**
 * A single-stroke ("engraving") font, just wide enough to write JR Importers.
 *
 * Ordinary fonts describe filled outlines, which can only be faded in. Writing
 * needs the opposite: the centre-line of each pen movement, in the order a hand
 * would make it. So these are hand-authored as polylines — down-strokes before
 * cross-strokes, left to right, the way you would actually write the word.
 *
 * Coordinates sit in a 1×1 em box with y up and the baseline at y=0, so
 * descenders (the p) go negative. `advance` is the pen travel to the next
 * glyph, which is why the letters are not evenly spaced.
 */

export interface Glyph {
  advance: number;
  /** Each entry is one continuous pen-down movement. */
  strokes: Array<Array<[number, number]>>;
}

/** Points on a circle, for the round letters. */
function arc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  from: number,
  to: number,
  steps = 18,
): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = from + ((to - from) * i) / steps;
    points.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return points;
}

export const GLYPHS: Record<string, Glyph> = {
  J: {
    advance: 0.62,
    strokes: [
      [
        [0.5, 0.72],
        [0.5, 0.22],
        [0.47, 0.09],
        [0.38, 0.01],
        [0.25, 0.0],
        [0.14, 0.07],
        [0.1, 0.19],
      ],
    ],
  },

  R: {
    advance: 0.66,
    strokes: [
      // Stem first, top to bottom — the way a hand starts a capital.
      [
        [0.12, 0.72],
        [0.12, 0.0],
      ],
      // Then the bowl, back up at the top.
      [
        [0.12, 0.72],
        [0.4, 0.72],
        [0.53, 0.66],
        [0.56, 0.55],
        [0.52, 0.44],
        [0.38, 0.39],
        [0.12, 0.39],
      ],
      // Then the leg.
      [
        [0.34, 0.39],
        [0.58, 0.0],
      ],
    ],
  },

  I: {
    advance: 0.26,
    strokes: [
      [
        [0.13, 0.72],
        [0.13, 0.0],
      ],
    ],
  },

  m: {
    advance: 0.76,
    strokes: [
      [
        [0.1, 0.5],
        [0.1, 0.0],
      ],
      [
        [0.1, 0.38],
        [0.17, 0.48],
        [0.28, 0.5],
        [0.36, 0.43],
        [0.37, 0.0],
      ],
      [
        [0.37, 0.38],
        [0.44, 0.48],
        [0.55, 0.5],
        [0.63, 0.43],
        [0.64, 0.0],
      ],
    ],
  },

  p: {
    advance: 0.56,
    strokes: [
      // The descender is one long down-stroke, past the baseline.
      [
        [0.11, 0.5],
        [0.11, -0.24],
      ],
      [
        [0.11, 0.38],
        [0.2, 0.49],
        [0.34, 0.5],
        [0.44, 0.42],
        [0.46, 0.26],
        [0.42, 0.11],
        [0.31, 0.03],
        [0.19, 0.05],
        [0.11, 0.14],
      ],
    ],
  },

  o: {
    advance: 0.54,
    strokes: [arc(0.27, 0.25, 0.18, 0.25, Math.PI / 2, Math.PI / 2 + Math.PI * 2, 22)],
  },

  r: {
    advance: 0.4,
    strokes: [
      [
        [0.12, 0.5],
        [0.12, 0.0],
      ],
      [
        [0.12, 0.34],
        [0.2, 0.46],
        [0.31, 0.5],
        [0.37, 0.48],
      ],
    ],
  },

  t: {
    advance: 0.4,
    strokes: [
      [
        [0.2, 0.68],
        [0.2, 0.12],
        [0.25, 0.02],
        [0.34, 0.02],
      ],
      // The cross-bar comes last, as it does when writing.
      [
        [0.06, 0.5],
        [0.36, 0.5],
      ],
    ],
  },

  e: {
    advance: 0.52,
    strokes: [
      [
        [0.07, 0.26],
        [0.44, 0.26],
        [0.45, 0.37],
        [0.38, 0.47],
        [0.25, 0.5],
        [0.13, 0.45],
        [0.06, 0.33],
        [0.06, 0.18],
        [0.13, 0.06],
        [0.26, 0.0],
        [0.4, 0.05],
      ],
    ],
  },

  s: {
    advance: 0.46,
    strokes: [
      [
        [0.4, 0.43],
        [0.3, 0.5],
        [0.16, 0.49],
        [0.09, 0.41],
        [0.13, 0.32],
        [0.27, 0.27],
        [0.37, 0.21],
        [0.39, 0.11],
        [0.3, 0.02],
        [0.16, 0.0],
        [0.07, 0.07],
      ],
    ],
  },

  ' ': { advance: 0.34, strokes: [] },
};

export interface LaidOutStroke {
  points: Array<[number, number]>;
  /** Approximate pen travel, used to keep writing speed constant. */
  length: number;
}

/**
 * Lays a string out into pen strokes in writing order.
 *
 * Returns positions in em units with the baseline at y=0; the caller scales
 * and places them. Strokes carry their own length so the animation can advance
 * by distance rather than by point count — otherwise a dense curve like the `o`
 * would appear to draw far slower than a straight stem.
 */
export function layOut(text: string): { strokes: LaidOutStroke[]; width: number } {
  const strokes: LaidOutStroke[] = [];
  let cursor = 0;

  for (const char of text) {
    const glyph = GLYPHS[char];
    if (!glyph) continue;

    for (const stroke of glyph.strokes) {
      const points = stroke.map(([x, y]) => [x + cursor, y] as [number, number]);

      let length = 0;
      for (let i = 1; i < points.length; i += 1) {
        length += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
      }

      strokes.push({ points, length });
    }

    cursor += glyph.advance;
  }

  return { strokes, width: cursor };
}
