import React, { useEffect, useMemo, useState } from "react";
import { AuditFont, BrandFonts, FontInfo, SandboxProxy } from "../../shared/DocumentSandboxApi";
import { suggestFonts } from "../api";
import { ALL_FONT_NAMES, PAIRINGS } from "../fontCatalog";

interface Props {
    sandboxProxy: SandboxProxy;
    fonts: BrandFonts;
    logo: string | null;
    onChange(fonts: BrandFonts): void;
    run(action: () => Promise<string> | string): Promise<void>;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const fontLabel = (f: FontInfo | null) => (f ? `${f.family} ${f.style}` : "Not set");

const FontsTab = ({ sandboxProxy, fonts, logo, onChange, run }: Props) => {
    const [available, setAvailable] = useState<FontInfo[] | null>(null);
    const [audit, setAudit] = useState<AuditFont[] | null>(null);
    const [aiReason, setAiReason] = useState("");
    const [thinking, setThinking] = useState(false);

    // Ask Express which of our curated fonts this user can use.
    useEffect(() => {
        sandboxProxy
            .getAvailableFonts(ALL_FONT_NAMES)
            .then(setAvailable)
            .catch(() => setAvailable([]));
    }, []);

    const byName = useMemo(() => new Map((available ?? []).map(f => [f.postscriptName, f])), [available]);
    const pairings = useMemo(() => PAIRINGS.filter(p => byName.has(p.heading) && byName.has(p.body)), [byName]);

    function usePairing(id: string) {
        const pairing = pairings.find(p => p.id === id);
        if (!pairing) return false;
        onChange({ heading: byName.get(pairing.heading)!, body: byName.get(pairing.body)! });
        setAudit(null);
        return true;
    }

    const pickFromSelection = (slot: "heading" | "body") =>
        run(async () => {
            const font = await sandboxProxy.getSelectionFont();
            if (!font) return "Select some text on the canvas first.";
            onChange({ ...fonts, [slot]: font });
            setAudit(null);
            return `${font.family} set as your ${slot} font.`;
        });

    const apply = (slot: "heading" | "body") =>
        run(async () => {
            const font = fonts[slot];
            if (!font) return `Choose a ${slot} font first.`;
            const result = await sandboxProxy.applyFontToSelection(font.postscriptName);
            // In development the panel can reload while Express keeps the older sandbox script,
            // which still answers with a plain number. Say so instead of misreading it.
            if (typeof result !== "object" || result === null) {
                return "The add-on is half reloaded. Reload the whole Express page (Cmd/Ctrl+R) and try again.";
            }
            const { changed, selected, textFound, locked, error } = result;
            if (changed > 0) return `Applied ${font.family} to ${plural(changed, "text item")}.`;
            if (error) return error;
            if (selected === 0 && locked > 0) return "That text box is locked, so Express won't let the add-on change it. Unlock it, then press Apply again.";
            // TODO remove the counts once the selection problem is understood; they are for diagnosis.
            if (selected === 0) return `Nothing is selected on the canvas. Click the text box once so it shows handles (don't double-click into the text), then press Apply. (Express reported ${selected} selected, ${locked} locked.)`;
            if (textFound === 0) return "That selection has no text in it. Click a text box, not a shape or image.";
            return `${font.family} could not be applied to that text.`;
        });

    const askAi = () =>
        run(async () => {
            if (!logo) return "Add a logo first so there is something to match.";
            if (pairings.length === 0) return "No suggested pairings are available in this account.";
            setThinking(true);
            try {
                const result = await suggestFonts(logo, pairings.map(({ id, label, mood }) => ({ id, label, mood })));
                if (!usePairing(result.pairingId)) return "The AI picked a pairing that isn't available. Try again.";
                setAiReason(result.reason);
                return "Fonts matched to your logo.";
            } finally {
                setThinking(false);
            }
        });

    const scan = () =>
        run(async () => {
            const families = [fonts.heading, fonts.body].filter((f): f is FontInfo => !!f).map(f => f.family);
            if (families.length === 0) return "Choose your brand fonts first.";
            const result = await sandboxProxy.auditFonts(families);
            setAudit(result);
            const off = result.filter(f => !f.onBrand).length;
            if (result.length === 0) return "No text found on this page.";
            return off === 0 ? "All text on this page uses your brand fonts." : `${plural(off, "off-brand font")} found.`;
        });

    const fix = () =>
        run(async () => {
            const changed = await sandboxProxy.fixOffBrandFonts(fonts);
            const families = [fonts.heading, fonts.body].filter((f): f is FontInfo => !!f).map(f => f.family);
            setAudit(await sandboxProxy.auditFonts(families));
            return changed === 0 ? "Nothing needed changing." : `Updated ${plural(changed, "text run")}. Large text got your heading font.`;
        });

    const offCount = audit ? audit.filter(f => !f.onBrand).length : 0;

    return (
        <section>
            {(["heading", "body"] as const).map(slot => (
                <div className="fontSlot" key={slot}>
                    <div className="fontSlotHead">
                        <span className="slotName">{slot === "heading" ? "Heading font" : "Body font"}</span>
                        <strong>{fontLabel(fonts[slot])}</strong>
                    </div>
                    <div className="slotActions">
                        <button className="mini" onClick={() => apply(slot)} disabled={!fonts[slot]}>
                            Apply to selection
                        </button>
                        <button className="mini" onClick={() => pickFromSelection(slot)}>
                            Use selected text's font
                        </button>
                    </div>
                </div>
            ))}

            <div className="field">
                <span>Suggested pairings</span>
                {available === null && <p className="hint">Checking which fonts you can use…</p>}
                {available !== null && pairings.length === 0 && (
                    <p className="hint">None of the suggested fonts are available in this account. Select text on the canvas and use its font instead.</p>
                )}
                <div className="pairings">
                    {pairings.map(p => {
                        const active = fonts.heading?.postscriptName === p.heading && fonts.body?.postscriptName === p.body;
                        return (
                            <button key={p.id} className={active ? "pairing active" : "pairing"} onClick={() => usePairing(p.id)}>
                                <strong>{p.label}</strong>
                                <small>
                                    {byName.get(p.heading)!.family} + {byName.get(p.body)!.family}
                                </small>
                            </button>
                        );
                    })}
                </div>
            </div>

            {logo && pairings.length > 0 && (
                <>
                    <button className="secondary" onClick={askAi} disabled={thinking}>
                        {thinking ? "Looking at your logo…" : "Match fonts to my logo (AI)"}
                    </button>
                    {aiReason && <p className="hint">{aiReason}</p>}
                    <p className="hint">This sends your logo image to the AI service to pick a pairing.</p>
                </>
            )}

            <button className="primary" onClick={scan}>
                Scan fonts on this page
            </button>

            {audit && audit.length > 0 && (
                <ul className="audit">
                    {audit.map(f => (
                        <li key={f.postscriptName}>
                            <span className="auditText">
                                <strong>
                                    {f.family} {f.style}
                                </strong>
                                <small>{plural(f.count, "use")}</small>
                            </span>
                            <span className={f.onBrand ? "badge ok" : "badge off"}>{f.onBrand ? "On brand" : "Off brand"}</span>
                        </li>
                    ))}
                </ul>
            )}

            {offCount > 0 && (
                <button className="secondary" onClick={fix}>
                    Fix {plural(offCount, "off-brand font")}
                </button>
            )}
        </section>
    );
};

export default FontsTab;
