// Pure color helpers shared by the panel UI and the document sandbox.
// No DOM or Adobe APIs here, so it is safe to import from either runtime.

export interface BrandColor {
    role: string;
    hex: string; // always "#RRGGBB", upper case
}

export type Harmony = "complementary" | "analogous" | "triadic" | "split" | "monochrome";

export const HARMONIES: { id: Harmony; label: string }[] = [
    { id: "complementary", label: "Complementary" },
    { id: "analogous", label: "Analogous" },
    { id: "triadic", label: "Triadic" },
    { id: "split", label: "Split complementary" },
    { id: "monochrome", label: "Monochrome" }
];

export function normalizeHex(input: string): string | null {
    let h = input.trim().replace(/^#/, "");
    if (/^[0-9a-fA-F]{3}$/.test(h)) {
        h = h.split("").map(c => c + c).join("");
    }
    if (/^[0-9a-fA-F]{8}$/.test(h)) {
        h = h.slice(0, 6);
    }
    return /^[0-9a-fA-F]{6}$/.test(h) ? "#" + h.toUpperCase() : null;
}

export function hexToRgb(hex: string): [number, number, number] {
    const h = (normalizeHex(hex) ?? "#000000").slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex(r: number, g: number, b: number): string {
    const p = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return ("#" + p(r) + p(g) + p(b)).toUpperCase();
}

export function hexToHsl(hex: string): [number, number, number] {
    const [r, g, b] = hexToRgb(hex).map(v => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) return [0, 0, l * 100];
    const s = d / (1 - Math.abs(2 * l - 1));
    let h: number;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [(h * 60 + 360) % 360, s * 100, l * 100];
}

export function hslToHex(h: number, s: number, l: number): string {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let rgb: [number, number, number];
    if (h < 60) rgb = [c, x, 0];
    else if (h < 120) rgb = [x, c, 0];
    else if (h < 180) rgb = [0, c, x];
    else if (h < 240) rgb = [0, x, c];
    else if (h < 300) rgb = [x, 0, c];
    else rgb = [c, 0, x];
    return rgbToHex((rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255);
}

/** Builds a five-role brand palette from one base color. */
export function generatePalette(baseHex: string, harmony: Harmony): BrandColor[] {
    const base = normalizeHex(baseHex) ?? "#5258E4";
    const [h, s, l] = hexToHsl(base);
    let secondaryHue = h;
    let accentHue = h;
    switch (harmony) {
        case "complementary":
            secondaryHue = h + 180;
            accentHue = h + 30;
            break;
        case "analogous":
            secondaryHue = h + 30;
            accentHue = h - 30;
            break;
        case "triadic":
            secondaryHue = h + 120;
            accentHue = h + 240;
            break;
        case "split":
            secondaryHue = h + 150;
            accentHue = h + 210;
            break;
        case "monochrome":
            break;
    }
    const mono = harmony === "monochrome";
    return [
        { role: "Primary", hex: base },
        { role: "Secondary", hex: mono ? hslToHex(h, s * 0.8, Math.min(l + 20, 80)) : hslToHex(secondaryHue, s * 0.85, l) },
        { role: "Accent", hex: mono ? hslToHex(h, s, Math.max(l - 20, 18)) : hslToHex(accentHue, Math.min(s * 1.1, 95), Math.min(l + 8, 70)) },
        { role: "Light", hex: hslToHex(h, Math.min(s, 30), 96) },
        { role: "Dark", hex: hslToHex(h, Math.min(s, 25), 12) }
    ];
}

// --- Perceptual distance (CIE Lab, delta E 76) -------------------------------------------------

function toLab(hex: string): [number, number, number] {
    const lin = hexToRgb(hex).map(v => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    const x = (lin[0] * 0.4124 + lin[1] * 0.3576 + lin[2] * 0.1805) / 0.95047;
    const y = lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722;
    const z = (lin[0] * 0.0193 + lin[1] * 0.1192 + lin[2] * 0.9505) / 1.08883;
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** 0 = identical. Around 2 is barely noticeable, 10+ is clearly a different color. */
export function colorDistance(a: string, b: string): number {
    const [l1, a1, b1] = toLab(a);
    const [l2, a2, b2] = toLab(b);
    return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

export function nearestBrandColor(hex: string, palette: string[]): { hex: string; distance: number } | null {
    let best: { hex: string; distance: number } | null = null;
    for (const p of palette) {
        const distance = colorDistance(hex, p);
        if (!best || distance < best.distance) best = { hex: p, distance };
    }
    return best;
}

/** WCAG contrast ratio between two colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
    const lum = (hex: string) => {
        const [r, g, bl] = hexToRgb(hex).map(v => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

export function readableTextOn(hex: string): string {
    return contrastRatio(hex, "#FFFFFF") >= contrastRatio(hex, "#111111") ? "#FFFFFF" : "#111111";
}

/** Below this Lab distance two colors are the same brand color in all but rounding. */
export const MERGE_DISTANCE = 14;

const PALETTE_ROLES = ["Primary", "Secondary", "Accent", "Extra 1", "Extra 2"];

/**
 * Turns weighted color candidates into a brand palette: near-identical colors fold
 * together, the most colorful lead, and each keeps its role name. Shared so a palette
 * read from a website looks the same as one read from a logo.
 */
export function toBrandColors(
    entries: { hex: string; weight: number }[],
    max = PALETTE_ROLES.length,
    vividBoost?: number
): BrandColor[] {
    const merged: { hex: string; weight: number }[] = [];
    for (const entry of [...entries].sort((a, b) => b.weight - a.weight)) {
        const hex = normalizeHex(entry.hex);
        if (!hex) continue;
        const match = merged.find(m => colorDistance(m.hex, hex) < MERGE_DISTANCE);
        if (match) match.weight += entry.weight;
        else merged.push({ hex, weight: entry.weight });
    }

    const vivid = (hex: string) => {
        const [, s, l] = hexToHsl(hex);
        return s > 25 && l > 12 && l < 90;
    };

    merged.sort((a, b) => {
        // Without a boost, any colorful candidate outranks any neutral one. That suits a
        // logo, where the colored mark is the brand however little of it there is. A web
        // page has hundreds of incidental colors, so there how much a color is used has
        // to count too, or a stray highlight beats the real brand color.
        if (vividBoost === undefined) return Number(vivid(b.hex)) - Number(vivid(a.hex)) || b.weight - a.weight;
        return b.weight * (vivid(b.hex) ? vividBoost : 1) - a.weight * (vivid(a.hex) ? vividBoost : 1);
    });
    return merged.slice(0, max).map((c, i) => ({ role: PALETTE_ROLES[i], hex: c.hex }));
}
