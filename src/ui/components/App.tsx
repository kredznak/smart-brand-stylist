import React, { useEffect, useRef, useState } from "react";
import { BrandColor, generatePalette, Harmony, HARMONIES, normalizeHex, readableTextOn } from "../../shared/color";
import { AuditResult, BrandFonts, SandboxProxy } from "../../shared/DocumentSandboxApi";
import { analyzeLogo, dataUrlToBlob } from "../extractColors";
import CopyTab, { BrandVoice } from "./CopyTab";
import FontsTab from "./FontsTab";
import "./App.css";

import { AddOnSDKAPI } from "https://new.express.adobe.com/static/add-on-sdk/sdk.js";

const STORAGE_KEY = "brandKit";
const DEFAULT_BASE = "#5258E4";

interface SavedKit {
    palette: BrandColor[];
    logo: string | null; // small PNG data URL
    base: string;
    harmony: Harmony;
    tolerance: number;
    fonts?: BrandFonts;
    voice?: BrandVoice;
}

type Step = "loading" | "onboarding" | "upload" | "results" | "kit";
type Tab = "kit" | "fonts" | "copy" | "audit";

const TABS: { id: Tab; label: string }[] = [
    { id: "kit", label: "Colors" },
    { id: "fonts", label: "Fonts" },
    { id: "copy", label: "Copy" },
    { id: "audit", label: "Audit" }
];

const App = ({ addOnUISdk, sandboxProxy }: { addOnUISdk: AddOnSDKAPI; sandboxProxy: SandboxProxy }) => {
    const [step, setStep] = useState<Step>("loading");
    const [tab, setTab] = useState<Tab>("kit");
    const [palette, setPalette] = useState<BrandColor[]>([]);
    const [logo, setLogo] = useState<string | null>(null);
    const [base, setBase] = useState(DEFAULT_BASE);
    const [harmony, setHarmony] = useState<Harmony>("complementary");
    const [tolerance, setTolerance] = useState(8);
    const [brandFonts, setBrandFonts] = useState<BrandFonts>({ heading: null, body: null });
    const [voice, setVoice] = useState<BrandVoice>({ brandName: "", description: "", tone: "Friendly" });
    const [audit, setAudit] = useState<AuditResult | null>(null);
    const [status, setStatus] = useState("");

    // Upload flow
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [draft, setDraft] = useState<{ palette: BrandColor[]; logo: string } | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);

    const store = addOnUISdk.instance.clientStorage;
    const paletteHex = palette.map(c => c.hex);

    // Returning users go straight to their saved kit.
    useEffect(() => {
        store
            .getItem(STORAGE_KEY)
            .then(saved => {
                const kit = saved as SavedKit | undefined;
                if (kit && Array.isArray(kit.palette) && kit.palette.length > 0) {
                    setPalette(kit.palette);
                    setLogo(kit.logo ?? null);
                    setBase(kit.base ?? DEFAULT_BASE);
                    setHarmony(kit.harmony ?? "complementary");
                    setTolerance(kit.tolerance ?? 8);
                    if (kit.fonts) setBrandFonts(kit.fonts);
                    if (kit.voice) setVoice(kit.voice);
                    setStep("kit");
                } else {
                    setStep("onboarding");
                }
            })
            .catch(() => setStep("onboarding"));
    }, []);

    useEffect(() => {
        if (step !== "kit") return;
        const kit: SavedKit = { palette, logo, base, harmony, tolerance, fonts: brandFonts, voice };
        store.setItem(STORAGE_KEY, kit).catch(() => undefined);
    }, [step, palette, logo, base, harmony, tolerance, brandFonts, voice]);

    useEffect(() => {
        if (!file) {
            setPreview(null);
            return;
        }
        const url = URL.createObjectURL(file);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    async function run(action: () => Promise<string> | string) {
        try {
            setStatus(await action());
        } catch (e) {
            console.error(e);
            setStatus(e instanceof Error ? e.message : "Something went wrong.");
        }
    }

    // --- Upload flow ---------------------------------------------------------------------------

    const analyze = () =>
        run(async () => {
            if (!file) return "Choose a logo file first.";
            setAnalyzing(true);
            try {
                const result = await analyzeLogo(file);
                setDraft({ palette: result.palette, logo: result.thumbnail });
                setStep("results");
                return "";
            } finally {
                setAnalyzing(false);
            }
        });

    function addBrand() {
        if (!draft) return;
        setPalette(draft.palette);
        setLogo(draft.logo);
        setAudit(null);
        setDraft(null);
        setFile(null);
        setTab("kit");
        setStep("kit");
        setStatus("Brand added. Click a color to apply it to your selection.");
    }

    function startFromColor() {
        setPalette(generatePalette(base, harmony));
        setLogo(null);
        setAudit(null);
        setTab("kit");
        setStep("kit");
        setStatus("");
    }

    function newBrand() {
        setFile(null);
        setDraft(null);
        setStatus("");
        setStep("upload");
    }

    // --- Kit tools -----------------------------------------------------------------------------

    function regenerate(nextBase: string, nextHarmony: Harmony) {
        setBase(nextBase);
        setHarmony(nextHarmony);
        setPalette(generatePalette(nextBase, nextHarmony));
        setAudit(null);
    }

    function editSwatch(index: number, value: string) {
        const hex = normalizeHex(value);
        if (!hex) return;
        setPalette(palette.map((c, i) => (i === index ? { ...c, hex } : c)));
        setAudit(null);
    }

    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

    const applyToSelection = (hex: string) =>
        run(async () => {
            const changed = await sandboxProxy.applyColorToSelection(hex);
            return changed === 0 ? "Select something on the canvas first." : `Applied ${hex} to ${plural(changed, "item")}.`;
        });

    const addPaletteToPage = () =>
        run(async () => {
            await sandboxProxy.addPaletteToPage(palette);
            return "Palette added to the page.";
        });

    const addLogoToPage = () =>
        run(async () => {
            if (!logo) return "";
            await addOnUISdk.app.document.addImage(dataUrlToBlob(logo));
            return "Logo added to the page.";
        });

    const scan = () =>
        run(async () => {
            const result = await sandboxProxy.auditPage(paletteHex, tolerance);
            setAudit(result);
            const off = result.colors.filter(c => !c.onBrand).length;
            if (result.colors.length === 0) return "No solid colors found on this page.";
            return off === 0 ? "Everything on this page is on brand." : `${plural(off, "off-brand color")} found.`;
        });

    const fix = () =>
        run(async () => {
            const changed = await sandboxProxy.fixOffBrandColors(paletteHex, tolerance);
            setAudit(await sandboxProxy.auditPage(paletteHex, tolerance));
            return changed === 0 ? "Nothing needed changing." : `Updated ${plural(changed, "item")}. Undo with Cmd/Ctrl+Z.`;
        });

    const offBrandCount = audit ? audit.colors.filter(c => !c.onBrand).length : 0;

    // --- Screens -------------------------------------------------------------------------------

    if (step === "loading") return <div className="screen" />;

    if (step === "onboarding") {
        return (
            <div className="screen">
                <div className="hero">
                    <h1>Smart Brand Stylist</h1>
                    <p>Turn your logo into a brand kit, then keep every design on brand.</p>
                </div>
                <button className="primary" onClick={() => setStep("upload")}>
                    Get started
                </button>
            </div>
        );
    }

    if (step === "upload") {
        return (
            <div className="screen">
                <header>
                    <h1>Smart Brand Stylist</h1>
                    <p>Upload your logo</p>
                </header>

                <div className="body">
                    {preview && (
                        <div className="logoCard">
                            <img src={preview} alt="Logo preview" />
                        </div>
                    )}
                    <input
                        ref={fileInput}
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        hidden
                        onChange={e => {
                            setFile(e.target.files?.[0] ?? null);
                            setStatus("");
                        }}
                    />
                    <div className="fileRow">
                        <button className="fileButton" onClick={() => fileInput.current?.click()}>
                            Choose file
                        </button>
                        <span className="fileName">{file ? file.name : "No file chosen"}</span>
                    </div>
                    <p className="hint">PNG, JPG, SVG or WebP. Your logo is analyzed on your device and is never uploaded.</p>
                    <button className="link" onClick={startFromColor}>
                        No logo? Start from a color instead
                    </button>
                </div>

                <p className="status" role="status" aria-live="polite">
                    {status}
                </p>
                <div className="actions">
                    <button className="primary" disabled={!file || analyzing} onClick={analyze}>
                        {analyzing ? "Analyzing…" : "Analyze brand"}
                    </button>
                    {palette.length > 0 && (
                        <button className="ghost" onClick={() => setStep("kit")}>
                            Cancel
                        </button>
                    )}
                </div>
            </div>
        );
    }

    if (step === "results" && draft) {
        return (
            <div className="screen">
                <header>
                    <h1>Brand style</h1>
                    <p>Here is what we found</p>
                </header>

                <div className="body">
                    <div className="logoCard">
                        <img src={draft.logo} alt="Your logo" />
                        <div className="resultSwatches">
                            {draft.palette.map(c => (
                                <span key={c.role} className="resultSwatch" style={{ background: c.hex }} title={`${c.role} ${c.hex}`} />
                            ))}
                        </div>
                    </div>
                    <ul className="resultList">
                        {draft.palette.map(c => (
                            <li key={c.role}>
                                <span className="chip" style={{ background: c.hex }} />
                                <span>{c.role}</span>
                                <code>{c.hex}</code>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="actions">
                    <button className="primary" onClick={addBrand}>
                        Add brand
                    </button>
                    <button className="ghost" onClick={newBrand}>
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="screen">
            <div className="tabs" role="tablist">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        role="tab"
                        aria-selected={tab === t.id}
                        className={tab === t.id ? "tab active" : "tab"}
                        onClick={() => {
                            setTab(t.id);
                            setStatus("");
                        }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === "kit" && (
                <section>
                    {logo && (
                        <div className="logoCard small">
                            <img src={logo} alt="Brand logo" />
                        </div>
                    )}

                    <p className="hint">Click a color to apply it to whatever is selected on the canvas.</p>
                    <ul className="swatches">
                        {palette.map((c, i) => (
                            <li key={c.role}>
                                <button
                                    className="swatch"
                                    style={{ background: c.hex, color: readableTextOn(c.hex) }}
                                    onClick={() => applyToSelection(c.hex)}
                                    title={`Apply ${c.hex} to selection`}
                                >
                                    {c.role}
                                </button>
                                <input type="text" className="hex" defaultValue={c.hex} key={c.hex} onBlur={e => editSwatch(i, e.target.value)} aria-label={`${c.role} hex`} />
                            </li>
                        ))}
                    </ul>

                    {!logo && (
                        <details open>
                            <summary>Generate from a base color</summary>
                            <div className="row">
                                <input type="color" value={base} onChange={e => regenerate(e.target.value.toUpperCase(), harmony)} aria-label="Pick base color" />
                                <select value={harmony} onChange={e => regenerate(base, e.target.value as Harmony)} aria-label="Color harmony">
                                    {HARMONIES.map(h => (
                                        <option key={h.id} value={h.id}>
                                            {h.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </details>
                    )}

                    <button className="primary" onClick={addPaletteToPage}>
                        Add palette to page
                    </button>
                    {logo && (
                        <button className="secondary" onClick={addLogoToPage}>
                            Add logo to page
                        </button>
                    )}
                    <button className="link" onClick={newBrand}>
                        Analyze a different logo
                    </button>
                </section>
            )}

            {tab === "fonts" && <FontsTab sandboxProxy={sandboxProxy} fonts={brandFonts} logo={logo} onChange={setBrandFonts} run={run} />}

            {tab === "copy" && (
                <CopyTab sandboxProxy={sandboxProxy} voice={voice} fonts={brandFonts} primaryHex={palette[0]?.hex} onVoiceChange={setVoice} run={run} />
            )}

            {tab === "audit" && (
                <section>
                    <label className="field">
                        <span>Strictness: {tolerance <= 4 ? "exact match" : tolerance <= 12 ? "close match" : "loose match"}</span>
                        <input
                            type="range"
                            min={1}
                            max={25}
                            value={tolerance}
                            onChange={e => {
                                setTolerance(Number(e.target.value));
                                setAudit(null);
                            }}
                        />
                    </label>

                    <button className="primary" onClick={scan}>
                        Scan colors on this page
                    </button>

                    {audit && audit.colors.length > 0 && (
                        <ul className="audit">
                            {audit.colors.map(c => (
                                <li key={c.hex}>
                                    <span className="chip" style={{ background: c.hex }} />
                                    <span className="auditText">
                                        <strong>{c.hex}</strong>
                                        <small>
                                            {plural(c.count, "use")} · {c.usedBy.join(", ")}
                                        </small>
                                    </span>
                                    {c.onBrand ? (
                                        <span className="badge ok">On brand</span>
                                    ) : (
                                        <span className="fixTo">
                                            <span className="badge off">Off brand</span>
                                            {c.nearestBrandHex && (
                                                <small>
                                                    → <span className="chip tiny" style={{ background: c.nearestBrandHex }} /> {c.nearestBrandHex}
                                                </small>
                                            )}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}

                    {offBrandCount > 0 && (
                        <button className="secondary" onClick={fix}>
                            Fix {plural(offBrandCount, "off-brand color")}
                        </button>
                    )}
                </section>
            )}

            <p className="status" role="status" aria-live="polite">
                {status}
            </p>
        </div>
    );
};

export default App;
