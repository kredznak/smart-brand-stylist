import { BrandColor } from "./color";

export interface AuditColor {
    hex: string;
    /** How many fills, strokes and text runs use this color on the page. */
    count: number;
    usedBy: ("fill" | "stroke" | "text")[];
    nearestBrandHex: string | null;
    distance: number;
    onBrand: boolean;
}

export interface AuditResult {
    colors: AuditColor[];
    scanned: number;
}

export interface FontInfo {
    postscriptName: string;
    family: string;
    style: string;
}

export interface AuditFont extends FontInfo {
    /** Number of text runs on the page using this font. */
    count: number;
    onBrand: boolean;
}

export interface BrandFonts {
    heading: FontInfo | null;
    body: FontInfo | null;
}

export interface TextStyle {
    postscriptName?: string;
    hex?: string;
    fontSize?: number;
}

/**
 * Why applying a font did or did not work. "Nothing changed" has several very
 * different causes and they need different advice, so each is reported separately
 * rather than collapsed into a count of zero.
 */
export interface ApplyFontResult {
    /** Text items that got the font. */
    changed: number;
    /** Nodes selected on the canvas, whatever their kind. */
    selected: number;
    /** Text items among them. */
    textFound: number;
    /** Nodes the user clicked that Express keeps out of the selection because they are locked. */
    locked: number;
    /** Set when Express refused the change. */
    error?: string;
}

// Everything the document sandbox (code.ts) exposes to the panel UI.
export interface DocumentSandboxApi {
    /** Build id of the running sandbox script, so the panel can detect a stale one. */
    build(): string;
    /** What Express currently reports as selected, so the panel can wait for it before acting. */
    describeSelection(): { selected: number; locked: number; text: number };
    auditPage(paletteHex: string[], tolerance: number): AuditResult;
    fixOffBrandColors(paletteHex: string[], tolerance: number): number;
    applyColorToSelection(hex: string): number;
    addPaletteToPage(palette: BrandColor[]): void;

    /** Returns the subset of the given PostScript names that this user can actually use in Express. */
    getAvailableFonts(postscriptNames: string[]): Promise<FontInfo[]>;
    /** Font of the first selected text, so users can pick a brand font straight from the canvas. */
    getSelectionFont(): FontInfo | null;
    applyFontToSelection(postscriptName: string): Promise<ApplyFontResult>;
    auditFonts(brandFamilies: string[]): AuditFont[];
    /** Large text gets the heading font, the rest gets the body font. Returns runs changed. */
    fixOffBrandFonts(fonts: BrandFonts): Promise<number>;
    addTextToPage(text: string, style: TextStyle): Promise<void>;
    /** Replaces the first selected text item. Returns false if no text is selected. */
    replaceSelectedText(text: string): boolean;
}

// The panel UI talks to the sandbox through a proxy, so every call comes back as a Promise.
export type SandboxProxy = {
    [K in keyof DocumentSandboxApi]: (
        ...args: Parameters<DocumentSandboxApi[K]>
    ) => Promise<Awaited<ReturnType<DocumentSandboxApi[K]>>>;
};
