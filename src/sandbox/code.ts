import addOnSandboxSdk from "add-on-sdk-document-sandbox";
import { AvailableFont, Color, colorUtils, constants, editor, fonts } from "express-document-sdk";
import { BrandColor, nearestBrandColor, normalizeHex, readableTextOn } from "../shared/color";
import {
    ApplyFontResult,
    AuditColor,
    AuditFont,
    AuditResult,
    BrandFonts,
    DocumentSandboxApi,
    FontInfo,
    TextStyle
} from "../shared/DocumentSandboxApi";

const { runtime } = addOnSandboxSdk.instance;

type Usage = "fill" | "stroke" | "text";

/** One place on the page where a solid color is used, with a way to replace it. */
interface ColorUse {
    hex: string;
    usage: Usage;
    replace(hex: string): void;
}

function toHex6(color: Color): string {
    return normalizeHex(colorUtils.toHex(color)) ?? "#000000";
}

function withAlpha(hex: string, alpha: number): Color {
    const c = colorUtils.fromHex(hex);
    return { red: c.red, green: c.green, blue: c.blue, alpha };
}

/** Collects every solid color used by the given nodes (and everything inside them). */
function collectColorUses(roots: Iterable<any>): { uses: ColorUse[]; scanned: number } {
    const uses: ColorUse[] = [];
    const seenText = new Set<string>();
    let scanned = 0;

    const visit = (node: any) => {
        scanned++;
        try {
            if (node.type === constants.SceneNodeType.text) {
                const model = node.fullContent;
                if (seenText.has(model.id)) return; // threaded text frames share one model
                seenText.add(model.id);
                let start = 0;
                for (const range of model.characterStyleRanges) {
                    const alpha = range.color.alpha;
                    const span = { start, length: range.length };
                    start += range.length;
                    uses.push({
                        hex: toHex6(range.color),
                        usage: "text",
                        replace: hex => model.applyCharacterStyles({ color: withAlpha(hex, alpha) }, span)
                    });
                }
                return;
            }
            const fill = node.fill;
            if (fill && fill.type === constants.FillType.color) {
                const alpha = fill.color.alpha;
                uses.push({
                    hex: toHex6(fill.color),
                    usage: "fill",
                    replace: hex => {
                        node.fill = editor.makeColorFill(withAlpha(hex, alpha));
                    }
                });
            }
            const stroke = node.stroke;
            if (stroke && stroke.type === constants.StrokeType.color && stroke.width > 0) {
                const alpha = stroke.color.alpha;
                uses.push({
                    hex: toHex6(stroke.color),
                    usage: "stroke",
                    replace: hex => {
                        node.stroke = editor.makeStroke({ ...stroke, color: withAlpha(hex, alpha) });
                    }
                });
            }
        } catch (e) {
            console.log("Skipped a node while scanning:", e);
        }
    };

    for (const root of roots) {
        visit(root);
        if (root.allDescendants) {
            for (const child of root.allDescendants) visit(child);
        }
    }
    return { uses, scanned };
}

/** Every distinct text content model under the given nodes (threaded frames share one model). */
function collectTextModels(roots: Iterable<any>): any[] {
    const models: any[] = [];
    const seen = new Set<string>();
    const visit = (node: any) => {
        try {
            if (node.type !== constants.SceneNodeType.text) return;
            const model = node.fullContent;
            if (seen.has(model.id)) return;
            seen.add(model.id);
            models.push(model);
        } catch (e) {
            console.log("Skipped a text node:", e);
        }
    };
    for (const root of roots) {
        visit(root);
        if (root.allDescendants) {
            for (const child of root.allDescendants) visit(child);
        }
    }
    return models;
}

const HEADING_MIN_SIZE = 30; // points; text this large is treated as a heading

const toFontInfo = (font: { postscriptName: string; family: string; style: string }): FontInfo => ({
    postscriptName: font.postscriptName,
    family: font.family,
    style: font.style
});

async function loadFonts(names: (string | undefined)[]): Promise<Map<string, AvailableFont>> {
    const loaded = new Map<string, AvailableFont>();
    for (const name of names) {
        if (!name || loaded.has(name)) continue;
        try {
            const font = await fonts.fromPostscriptName(name);
            if (font) loaded.set(name, font);
        } catch (e) {
            console.log("Font lookup failed for", name, e);
        }
    }
    return loaded;
}

function pageRoots(): Iterable<any> {
    return editor.context.currentPage.artboards;
}

function start(): void {
    const sandboxApi: DocumentSandboxApi = {
        auditPage(paletteHex: string[], tolerance: number): AuditResult {
            const { uses, scanned } = collectColorUses(pageRoots());
            const byHex = new Map<string, AuditColor>();
            for (const use of uses) {
                let entry = byHex.get(use.hex);
                if (!entry) {
                    const nearest = nearestBrandColor(use.hex, paletteHex);
                    entry = {
                        hex: use.hex,
                        count: 0,
                        usedBy: [],
                        nearestBrandHex: nearest ? nearest.hex : null,
                        distance: nearest ? nearest.distance : 0,
                        onBrand: nearest ? nearest.distance <= tolerance : true
                    };
                    byHex.set(use.hex, entry);
                }
                entry.count++;
                if (!entry.usedBy.includes(use.usage)) entry.usedBy.push(use.usage);
            }
            const colors = [...byHex.values()].sort(
                (a, b) => Number(a.onBrand) - Number(b.onBrand) || b.count - a.count
            );
            return { colors, scanned };
        },

        fixOffBrandColors(paletteHex: string[], tolerance: number): number {
            const { uses } = collectColorUses(pageRoots());
            let changed = 0;
            for (const use of uses) {
                const nearest = nearestBrandColor(use.hex, paletteHex);
                // Exact matches need no change; anything else beyond tolerance snaps to the brand color.
                if (!nearest || nearest.distance <= tolerance) continue;
                try {
                    use.replace(nearest.hex);
                    changed++;
                } catch (e) {
                    console.log("Could not recolor a node (it may be locked):", e);
                }
            }
            return changed;
        },

        applyColorToSelection(hex: string): number {
            const { uses } = collectColorUses(editor.context.selection);
            let changed = 0;
            for (const use of uses) {
                if (use.usage === "stroke") continue;
                try {
                    use.replace(hex);
                    changed++;
                } catch (e) {
                    console.log("Could not recolor a selected node:", e);
                }
            }
            return changed;
        },

        addPaletteToPage(palette: BrandColor[]): void {
            const parent = editor.context.insertionParent;
            const size = 120;
            const gap = 16;
            palette.forEach((brandColor, i) => {
                const x = 40 + i * (size + gap);
                const swatch = editor.createRectangle();
                swatch.width = size;
                swatch.height = size;
                swatch.topLeftRadius = swatch.topRightRadius = 12;
                swatch.bottomLeftRadius = swatch.bottomRightRadius = 12;
                swatch.fill = editor.makeColorFill(colorUtils.fromHex(brandColor.hex));
                swatch.translation = { x, y: 40 };
                parent.children.append(swatch);

                const label = editor.createText(`${brandColor.role}\n${brandColor.hex}`);
                parent.children.append(label);
                label.fullContent.applyCharacterStyles({
                    fontSize: 14,
                    color: colorUtils.fromHex(readableTextOn(brandColor.hex))
                });
                label.setPositionInParent({ x: x + 12, y: 52 }, { x: 0, y: 0 });
            });
        },

        async getAvailableFonts(postscriptNames: string[]): Promise<FontInfo[]> {
            const loaded = await loadFonts(postscriptNames);
            return [...loaded.values()].map(toFontInfo);
        },

        getSelectionFont(): FontInfo | null {
            for (const model of collectTextModels(editor.context.selection)) {
                const first = model.characterStyleRanges[0];
                if (first) return toFontInfo(first.font);
            }
            return null;
        },

        async applyFontToSelection(postscriptName: string): Promise<ApplyFontResult> {
            const result: ApplyFontResult = { changed: 0, selected: 0, textFound: 0 };
            await editor.keepContentActiveDuringAsync(
                editor.context.currentPage,
                () => loadFonts([postscriptName]),
                loaded => {
                    const selection = editor.context.selection;
                    result.selected = selection.length;

                    const font = loaded.get(postscriptName);
                    if (!font) {
                        result.error = `${postscriptName} is not available to this Express account.`;
                        return;
                    }

                    const models = collectTextModels(selection);
                    result.textFound = models.length;
                    for (const model of models) {
                        try {
                            model.applyCharacterStyles({ font });
                            result.changed++;
                        } catch (e) {
                            // Report it rather than let it look like nothing was selected.
                            result.error = e instanceof Error ? e.message : String(e);
                            console.log("Could not change the font of a text item:", e);
                        }
                    }
                }
            );
            return result;
        },

        auditFonts(brandFamilies: string[]): AuditFont[] {
            const brand = brandFamilies.map(f => f.toLowerCase());
            const byName = new Map<string, AuditFont>();
            for (const model of collectTextModels(pageRoots())) {
                for (const range of model.characterStyleRanges) {
                    const info = toFontInfo(range.font);
                    let entry = byName.get(info.postscriptName);
                    if (!entry) {
                        entry = { ...info, count: 0, onBrand: brand.includes(info.family.toLowerCase()) };
                        byName.set(info.postscriptName, entry);
                    }
                    entry.count++;
                }
            }
            return [...byName.values()].sort((a, b) => Number(a.onBrand) - Number(b.onBrand) || b.count - a.count);
        },

        async fixOffBrandFonts(brandFonts: BrandFonts): Promise<number> {
            const headingName = (brandFonts.heading ?? brandFonts.body)?.postscriptName;
            const bodyName = (brandFonts.body ?? brandFonts.heading)?.postscriptName;
            const brandFamilies = [brandFonts.heading, brandFonts.body]
                .filter((f): f is FontInfo => !!f)
                .map(f => f.family.toLowerCase());
            let changed = 0;
            await editor.keepContentActiveDuringAsync(
                editor.context.currentPage,
                () => loadFonts([headingName, bodyName]),
                loaded => {
                    const heading = headingName ? loaded.get(headingName) : undefined;
                    const body = bodyName ? loaded.get(bodyName) : undefined;
                    for (const model of collectTextModels(pageRoots())) {
                        let start = 0;
                        for (const range of model.characterStyleRanges) {
                            const span = { start, length: range.length };
                            start += range.length;
                            if (brandFamilies.includes(range.font.family.toLowerCase())) continue;
                            const font = range.fontSize >= HEADING_MIN_SIZE ? heading : body;
                            if (!font) continue;
                            try {
                                model.applyCharacterStyles({ font }, span);
                                changed++;
                            } catch (e) {
                                console.log("Could not change a font (the text may use an unavailable font):", e);
                            }
                        }
                    }
                }
            );
            return changed;
        },

        async addTextToPage(text: string, style: TextStyle): Promise<void> {
            await editor.keepContentActiveDuringAsync(
                editor.context.currentPage,
                () => loadFonts([style.postscriptName]),
                loaded => {
                    const parent = editor.context.insertionParent;
                    const node = editor.createText(text);
                    parent.children.append(node);
                    const font = style.postscriptName ? loaded.get(style.postscriptName) : undefined;
                    node.fullContent.applyCharacterStyles({
                        ...(font ? { font } : {}),
                        ...(style.hex ? { color: colorUtils.fromHex(style.hex) } : {}),
                        fontSize: style.fontSize ?? 32
                    });
                    // Wrap long copy to the page width instead of running off the canvas in one line.
                    const page = editor.context.currentPage;
                    const maxWidth = Math.max(200, page.width - 80);
                    if (text.length > 40) {
                        try {
                            node.layout = { type: constants.TextLayout.autoHeight, width: maxWidth };
                        } catch (e) {
                            console.log("Could not wrap the text:", e);
                        }
                    }
                    node.setPositionInParent({ x: 40, y: 200 }, { x: 0, y: 0 });
                }
            );
        },

        replaceSelectedText(text: string): boolean {
            const model = collectTextModels(editor.context.selection)[0];
            if (!model) return false;
            model.text = text;
            return true;
        }
    };

    runtime.exposeApi(sandboxApi);
}

start();
