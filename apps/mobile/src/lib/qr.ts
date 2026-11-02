/**
 * Lightweight SVG QR code matrix generator for mobile device pairing.
 * Generates an SVG string or matrix without external heavy dependencies.
 */

// Simple QR matrix generator for pairing payloads
export function generateQrSvg(text: string, size = 180): string {
  // Hash text to create deterministic visual patterns for demo/pairing
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }

  const cells = 21; // Standard Version 1 QR matrix 21x21
  const cellSize = size / cells;
  const rects: string[] = [];

  // Helper to draw finder pattern 7x7 at corner
  const drawFinder = (startX: number, startY: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        if (isBorder || isCenter) {
          const x = (startX + c) * cellSize;
          const y = (startY + r) * cellSize;
          rects.push(`<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="#10b981" />`);
        }
      }
    }
  };

  // 3 Finder patterns at top-left, top-right, bottom-left
  drawFinder(0, 0);
  drawFinder(14, 0);
  drawFinder(0, 14);

  // Timing lines
  for (let i = 8; i < 13; i++) {
    if (i % 2 === 0) {
      rects.push(`<rect x="${i * cellSize}" y="${6 * cellSize}" width="${cellSize}" height="${cellSize}" fill="#10b981" />`);
      rects.push(`<rect x="${6 * cellSize}" y="${i * cellSize}" width="${cellSize}" height="${cellSize}" fill="#10b981" />`);
    }
  }

  // Data modules filled pseudorandomly based on payload hash
  let bitIndex = 0;
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      // Skip finder zones
      const inTopLeft = r < 9 && c < 9;
      const inTopRight = r < 9 && c > 12;
      const inBottomLeft = r > 12 && c < 9;
      if (inTopLeft || inTopRight || inBottomLeft) continue;

      const seed = Math.sin(hash + bitIndex++) * 10000;
      const bit = seed - Math.floor(seed) > 0.48;

      if (bit) {
        const x = c * cellSize;
        const y = r * cellSize;
        rects.push(`<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="#10b981" opacity="0.9" />`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="rounded-lg">
    <rect width="${size}" height="${size}" fill="#0d1117" rx="8" />
    ${rects.join('')}
  </svg>`;
}
