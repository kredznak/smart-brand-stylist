import { BrandColor, colorDistance, MERGE_DISTANCE, rgbToHex, toBrandColors } from "../shared/color";

// Reads a logo file in the browser and pulls out its main colors.
// Everything happens on the user's device: the image is never uploaded anywhere.

const SAMPLE_SIZE = 160; // longest edge used for analysis
const MIN_SHARE = 0.015; // ignore colors covering less than 1.5% of the logo
const MAX_COLORS = 5;

export interface LogoAnalysis {
    palette: BrandColor[];
    /** Small PNG data URL of the logo, for previews and saving with the kit. */
    thumbnail: string;
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("That file could not be read as an image."));
        };
        img.src = url;
    });
}

function drawScaled(img: HTMLImageElement, longestEdge: number): HTMLCanvasElement {
    const w = img.naturalWidth || 300;
    const h = img.naturalHeight || 300;
    const scale = Math.min(1, longestEdge / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
}

interface Cluster {
    r: number;
    g: number;
    b: number;
    count: number;
}

const clusterHex = (c: Cluster) => rgbToHex(c.r / c.count, c.g / c.count, c.b / c.count);

/** If all four corners share one opaque color, treat it as the logo's background. */
function detectBackground(data: Uint8ClampedArray, w: number, h: number): string | null {
    const corners = [0, w - 1, (h - 1) * w, h * w - 1].map(i => i * 4);
    const hexes: string[] = [];
    for (const i of corners) {
        if (data[i + 3] < 128) return null; // transparent background, nothing to remove
        hexes.push(rgbToHex(data[i], data[i + 1], data[i + 2]));
    }
    return hexes.every(hx => colorDistance(hx, hexes[0]) < 6) ? hexes[0] : null;
}

export async function analyzeLogo(file: Blob): Promise<LogoAnalysis> {
    const img = await loadImage(file);
    const canvas = drawScaled(img, SAMPLE_SIZE);
    const { data, width, height } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    const background = detectBackground(data, width, height);

    // 1. Bucket pixels coarsely (5 bits per channel) so the histogram stays small.
    const buckets = new Map<number, Cluster>();
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
        let bucket = buckets.get(key);
        if (!bucket) {
            bucket = { r: 0, g: 0, b: 0, count: 0 };
            buckets.set(key, bucket);
        }
        bucket.r += data[i];
        bucket.g += data[i + 1];
        bucket.b += data[i + 2];
        bucket.count++;
        total++;
    }
    if (total === 0) throw new Error("This image looks empty. Try a different file.");

    // 2. Merge similar buckets, biggest first, so anti-aliased edges fold into their main color.
    const sorted = [...buckets.values()].sort((a, b) => b.count - a.count);
    const clusters: (Cluster & { hex: string })[] = [];
    for (const bucket of sorted) {
        const hex = clusterHex(bucket);
        const match = clusters.find(c => colorDistance(c.hex, hex) < MERGE_DISTANCE);
        if (match) {
            match.r += bucket.r;
            match.g += bucket.g;
            match.b += bucket.b;
            match.count += bucket.count;
        } else {
            clusters.push({ ...bucket, hex });
        }
    }

    // 3. Drop the background and tiny specks, keep the most used colors.
    let foregroundTotal = total;
    let candidates = clusters.map(c => ({ hex: clusterHex(c), count: c.count }));
    if (background) {
        const kept = candidates.filter(c => colorDistance(c.hex, background) >= MERGE_DISTANCE);
        if (kept.length > 0) {
            foregroundTotal = kept.reduce((sum, c) => sum + c.count, 0);
            candidates = kept;
        }
    }
    let main = candidates.filter(c => c.count / foregroundTotal >= MIN_SHARE).slice(0, MAX_COLORS);
    if (main.length === 0) main = candidates.slice(0, 1);

    // 4. The most colorful of the dominant colors leads; neutrals follow.
    return {
        palette: toBrandColors(main.map(c => ({ hex: c.hex, weight: c.count })), MAX_COLORS),
        thumbnail: drawScaled(img, 256).toDataURL("image/png")
    };
}

export function dataUrlToBlob(dataUrl: string): Blob {
    const [header, base64] = dataUrl.split(",");
    const mime = /data:(.*?);/.exec(header)?.[1] ?? "image/png";
    const bytes = atob(base64);
    const buffer = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
    return new Blob([buffer], { type: mime });
}
