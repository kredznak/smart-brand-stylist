// Reads brand colors and fonts out of a public web page.
// This runs on the server because the add-on panel is a sandboxed iframe and
// cannot fetch other origins itself.

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 1_500_000;
const MAX_CSS_BYTES = 900_000;
const HARD_LIMIT_BYTES = 6_000_000;
const MAX_STYLESHEETS = 8;
const MAX_ICON_BYTES = 180_000;
const MAX_CANDIDATES = 40;

// Weights say how much a declaration suggests a *brand* color rather than
// incidental styling. A custom property is usually someone naming their palette.
const PROPERTY_WEIGHT = [
    [/^--/, 8],
    [/^(background|background-color)$/, 3],
    [/^(fill|stroke)$/, 2],
    [/^color$/, 2],
    [/^border(-[a-z]+)?-color$/, 1]
];

const GENERIC_FAMILIES = new Set([
    "inherit", "initial", "unset", "revert", "sans-serif", "serif", "monospace", "cursive",
    "fantasy", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "ui-rounded",
    "-apple-system", "blinkmacsystemfont", "segoe ui", "roboto ui", "emoji", "math"
]);

// A custom property holding a family, as opposed to one holding a size or a weight.
const FONT_VAR = /family|typeface|(^|-)font(-|$)/i;
const NOT_FONT_VAR = /mono|code|size|weight|track|spacing|scale|height|leading|letter|style|variant|feature|smooth/i;

const clamp255 = n => Math.max(0, Math.min(255, Math.round(n)));
const toHex = n => clamp255(n).toString(16).padStart(2, "0");
const rgbHex = (r, g, b) => ("#" + toHex(r) + toHex(g) + toHex(b)).toUpperCase();

function hslHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return rgbHex((t[0] + m) * 255, (t[1] + m) * 255, (t[2] + m) * 255);
}

/** OKLCH and OKLab through to sRGB, since modern CSS increasingly ships colors this way. */
function oklabHex(L, a, b) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;

    const lin = [
        +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    ];
    const gamma = v => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055);
    return rgbHex(...lin.map(v => gamma(v) * 255));
}

/** One CSS color token to #RRGGBB, or null if it is unreadable or see-through. */
export function normalizeColor(token) {
    const t = token.trim().toLowerCase();

    if (t.startsWith("#")) {
        const h = t.slice(1);
        if (!/^[0-9a-f]+$/.test(h)) return null;
        if (h.length === 3 || h.length === 4) {
            if (h.length === 4 && parseInt(h[3] + h[3], 16) < 64) return null;
            return rgbHex(...[0, 1, 2].map(i => parseInt(h[i] + h[i], 16)));
        }
        if (h.length === 6 || h.length === 8) {
            if (h.length === 8 && parseInt(h.slice(6, 8), 16) < 64) return null;
            return rgbHex(...[0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)));
        }
        return null;
    }

    const fn = t.match(/^(rgba?|hsla?|oklch|oklab)\(([^)]*)\)$/);
    if (!fn) return null;
    // Both comma and space syntax, with an optional "/ alpha" tail.
    const parts = fn[2].replace(/\//g, " ").split(/[\s,]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const nums = parts.map(p => parseFloat(p));
    if (nums.slice(0, 3).some(n => Number.isNaN(n))) return null;
    if (parts.length > 3) {
        const raw = parts[3];
        const alpha = raw.endsWith("%") ? parseFloat(raw) / 100 : parseFloat(raw);
        if (!Number.isNaN(alpha) && alpha < 0.25) return null; // too faint to be a brand color
    }
    if (fn[1].startsWith("hsl")) return hslHex(nums[0], nums[1], nums[2]);
    if (fn[1] === "oklch" || fn[1] === "oklab") {
        // Lightness may be a percentage; chroma and the axes are plain numbers.
        const L = parts[0].endsWith("%") ? nums[0] / 100 : nums[0];
        if (fn[1] === "oklab") return oklabHex(L, nums[1], nums[2]);
        const hue = (nums[2] * Math.PI) / 180;
        return oklabHex(L, nums[1] * Math.cos(hue), nums[1] * Math.sin(hue));
    }
    // Percentage rgb() is legal but rare; treat it as 0-255 only when it clearly is.
    return parts.slice(0, 3).some(p => p.endsWith("%"))
        ? rgbHex(...nums.slice(0, 3).map(n => (n / 100) * 255))
        : rgbHex(nums[0], nums[1], nums[2]);
}

const COLOR_TOKEN = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\([^)]*\)/g;
const RULE = /([^{}]+)\{([^{}]*)\}/g;
const DECLARATION = /(--[\w-]+|[a-zA-Z-]+)\s*:\s*([^;{}]+)/g;

function weightFor(property) {
    for (const [pattern, weight] of PROPERTY_WEIGHT) if (pattern.test(property)) return weight;
    return 0;
}

// Weight and style keywords share the `font` shorthand with the family, and a
// bare size looks just like a name once it is split off, so both are rejected.
const NOT_A_FAMILY = /^(bold(er)?|lighter|normal|italic|oblique|small-caps|caption|icon|menu|message-box|small-caption|status-bar)$/i;

function cleanFamily(value) {
    const first = value.split(",")[0].trim().replace(/^["']|["']$/g, "").trim();
    if (!first || first.length > 40) return null;
    // A real family starts with a letter. That alone rules out sizes, signed lengths
    // like -0.01em, and the -apple-system style aliases, which are generic anyway.
    if (!/^[a-z]/i.test(first) || /[()]/.test(first)) return null;
    if (NOT_A_FAMILY.test(first)) return null;
    return GENERIC_FAMILIES.has(first.toLowerCase()) ? null : first;
}

/** Walks CSS text, adding to the running color and font tallies. */
function readCss(css, colors, fonts) {
    for (const [, selector, block] of css.matchAll(RULE)) {
        const heading = /(^|[\s,>+~])h[1-3]\b/i.test(selector);
        for (const [, property, value] of block.matchAll(DECLARATION)) {
            const prop = property.toLowerCase();

            if (prop === "font-family") {
                const family = cleanFamily(value);
                // @font-face names a family the site actually ships, so it outranks a use of one.
                if (family) bump(fonts, family, /@font-face/i.test(selector) ? 8 : heading ? 6 : 2);
                continue;
            }
            // Sites increasingly hold the family in a custom property and use var() at the point
            // of use, so the definition is the only place the real name appears.
            if (prop.startsWith("--") && FONT_VAR.test(prop) && !NOT_FONT_VAR.test(prop)) {
                const family = cleanFamily(value);
                if (family) bump(fonts, family, 4);
            }

            const weight = weightFor(prop);
            if (weight === 0) continue;
            for (const token of value.match(COLOR_TOKEN) ?? []) {
                const hex = normalizeColor(token);
                if (hex) bump(colors, hex, weight);
            }
        }
    }
}

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

function decodeEntities(text) {
    return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body) => {
        const key = body.toLowerCase();
        if (key in NAMED_ENTITIES) return NAMED_ENTITIES[key];
        if (key.startsWith("#")) {
            const code = key.startsWith("#x") ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
            return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
        }
        return whole;
    });
}

function bump(map, key, amount) {
    map.set(key, (map.get(key) ?? 0) + amount);
}

function attr(tag, name) {
    const m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
    return m ? (m[2] ?? m[3] ?? m[4] ?? "").trim() : null;
}

async function get(url, { as = "text", maxBytes, accept } = {}) {
    const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
            // Some sites serve a stub to unknown clients; identify honestly but acceptably.
            "user-agent": "Mozilla/5.0 (compatible; SmartBrandStylist/1.0; +https://github.com/kredznak/smart-brand-stylist)",
            accept: accept ?? "text/html,application/xhtml+xml,*/*"
        }
    });
    if (!response.ok) {
        const blocked = response.status === 403 || response.status === 401 || response.status === 429;
        throw new Error(blocked ? "That site does not allow automated readers." : `That site replied with ${response.status}.`);
    }

    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > HARD_LIMIT_BYTES) throw new Error("That page is too large to analyze.");

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > HARD_LIMIT_BYTES) throw new Error("That page is too large to analyze.");

    // An image has to arrive whole to be usable, but text does not: a stylesheet a little
    // over the budget still yields its colors, and refusing it outright returns nothing.
    if (as === "buffer") {
        if (maxBytes && buffer.byteLength > maxBytes) throw new Error("That file is too large.");
        return { buffer, type: (response.headers.get("content-type") ?? "").split(";")[0].trim() };
    }
    const text = maxBytes && buffer.byteLength > maxBytes ? buffer.slice(0, maxBytes) : buffer;
    return new TextDecoder("utf-8", { fatal: false }).decode(text);
}

/** apple-touch-icon and friends are usually the square logo; og:image is a banner, so it comes last. */
async function readIcon(html, pageUrl) {
    const candidates = [];
    for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
        const rel = (attr(tag, "rel") ?? "").toLowerCase();
        const href = attr(tag, "href");
        if (!href) continue;
        if (rel.includes("apple-touch-icon")) candidates.push([0, href]);
        else if (rel.includes("icon")) candidates.push([1, href]);
    }
    for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
        const key = ((attr(tag, "property") ?? attr(tag, "name")) ?? "").toLowerCase();
        const content = attr(tag, "content");
        if (content && (key === "og:image" || key === "twitter:image")) candidates.push([2, content]);
    }

    for (const [, href] of candidates.sort((a, b) => a[0] - b[0]).slice(0, 4)) {
        try {
            const url = new URL(href, pageUrl);
            if (url.protocol !== "https:" && url.protocol !== "http:") continue;
            const { buffer, type } = await get(url.href, { as: "buffer", maxBytes: MAX_ICON_BYTES, accept: "image/*" });
            // Only the formats the rest of the add-on can use: Claude's vision input and Express images.
            if (!["image/png", "image/jpeg", "image/webp"].includes(type)) continue;
            let binary = "";
            for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
            return `data:${type};base64,${btoa(binary)}`;
        } catch {
            // A missing or oversized icon is not a reason to fail the whole analysis.
        }
    }
    return null;
}

export async function readSiteBrand(pageUrl) {
    const html = await get(pageUrl, { maxBytes: MAX_HTML_BYTES });

    const colors = new Map();
    const fonts = new Map();

    // A declared theme color is the clearest brand signal a page can give.
    for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
        if ((attr(tag, "name") ?? "").toLowerCase() !== "theme-color") continue;
        const hex = normalizeColor(attr(tag, "content") ?? "");
        if (hex) bump(colors, hex, 50);
    }

    for (const [, block] of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) readCss(block, colors, fonts);
    for (const [tag] of html.matchAll(/<[a-z][^>]*\sstyle\s*=\s*["'][^"']*["'][^>]*>/gi)) {
        const inline = attr(tag, "style");
        if (inline) readCss(`x{${inline}}`, colors, fonts);
    }

    const sheets = new Set();
    for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
        const rel = (attr(tag, "rel") ?? "").toLowerCase();
        const href = attr(tag, "href");
        if (!href || !rel.includes("stylesheet")) continue;
        try {
            const url = new URL(href, pageUrl);
            // Google Fonts names the families in the URL, so read it without fetching.
            if (url.hostname.endsWith("fonts.googleapis.com")) {
                for (const family of url.searchParams.getAll("family")) {
                    const name = cleanFamily(family.split(":")[0].replace(/\+/g, " "));
                    if (name) bump(fonts, name, 8);
                }
                continue;
            }
            if (url.protocol === "https:" || url.protocol === "http:") sheets.add(url.href);
        } catch {
            // A malformed href is just skipped.
        }
    }

    // A big site can link fifty stylesheets and we can only afford a few, so read the
    // ones whose names suggest type and global styling before per-component sheets.
    const promising = /font|type|global|main|app|index|base|theme|style|layout|root/i;
    const ordered = [...sheets].sort((a, b) => Number(promising.test(b)) - Number(promising.test(a)));

    const fetched = await Promise.allSettled(
        ordered.slice(0, MAX_STYLESHEETS).map(href => get(href, { maxBytes: MAX_CSS_BYTES, accept: "text/css,*/*" }))
    );
    for (const result of fetched) if (result.status === "fulfilled") readCss(result.value, colors, fonts);

    const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);

    const rank = map =>
        [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_CANDIDATES).map(([value, weight]) => ({ value, weight }));

    return {
        title,
        colors: rank(colors).map(c => ({ hex: c.value, weight: c.weight })),
        fonts: rank(fonts).slice(0, 6).map(f => ({ family: f.value, weight: f.weight })),
        icon: await readIcon(html, pageUrl)
    };
}
