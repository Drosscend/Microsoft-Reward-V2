// Dynamic extension icon: colored circle with white star (no OffscreenCanvas)

const SIZES = [16, 32] as const;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

// Check if point is inside a 5-pointed star
function isInsideStar(
  px: number,
  py: number,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
): boolean {
  const spikes = 5;
  const vertices: [number, number][] = [];

  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI * i) / spikes - Math.PI / 2;
    vertices.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }

  // Ray-casting point-in-polygon
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const [xi, yi] = vertices[i];
    const [xj, yj] = vertices[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function createIcon(hex: string, size: number): ImageData {
  const [r, g, b] = hexToRgb(hex);
  const data = new Uint8ClampedArray(size * size * 4);
  const center = size / 2;
  const radius = center - Math.max(1, size * 0.06);
  const starOuter = center * 0.52;
  const starInner = center * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center + 0.5;
      const dy = y - center + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i = (y * size + x) * 4;

      if (dist <= radius) {
        if (isInsideStar(x + 0.5, y + 0.5, center, center, starOuter, starInner)) {
          // White star
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
          data[i + 3] = 255;
        } else {
          // Background color
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = 255;
        }
      }
      // else: transparent (alpha = 0)
    }
  }

  return new ImageData(data, size, size);
}

async function setIcon(color: string): Promise<void> {
  const imageData: Record<string, ImageData> = {};
  for (const size of SIZES) {
    imageData[String(size)] = createIcon(color, size);
  }
  await chrome.action.setIcon({ imageData });
}

const COLOR_DEFAULT = "#0078d4"; // Microsoft blue
const COLOR_RUNNING = "#22c55e"; // Green

export async function setIconDefault(): Promise<void> {
  await setIcon(COLOR_DEFAULT);
}

export async function setIconRunning(): Promise<void> {
  await setIcon(COLOR_RUNNING);
}
