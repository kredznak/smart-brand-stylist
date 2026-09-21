import { settleSelection } from "../selection";
import React, { useState } from "react";
import { BrandFonts, SandboxProxy } from "../../shared/DocumentSandboxApi";
import { suggestCopy } from "../api";

export interface BrandVoice {
    brandName: string;
    description: string;
    tone: string;
}

interface Props {
    sandboxProxy: SandboxProxy;
    voice: BrandVoice;
    fonts: BrandFonts;
    primaryHex: string | undefined;
    onVoiceChange(voice: BrandVoice): void;
    run(action: () => Promise<string> | string): Promise<void>;
}

const TONES = ["Friendly", "Professional", "Bold", "Playful", "Elegant", "Minimal"];

// `heading: true` styles the text with the heading font at a large size.
const KINDS = [
    { id: "tagline", label: "Tagline", heading: true },
    { id: "headline", label: "Headline", heading: true },
    { id: "cta", label: "Button text", heading: true },
    { id: "social", label: "Social caption", heading: false },
    { id: "about", label: "About blurb", heading: false }
];

const CopyTab = ({ sandboxProxy, voice, fonts, primaryHex, onVoiceChange, run }: Props) => {
    const [kind, setKind] = useState("tagline");
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [writing, setWriting] = useState(false);

    const ready = voice.brandName.trim().length > 0 && voice.description.trim().length > 0;
    const isHeading = KINDS.find(k => k.id === kind)?.heading ?? true;

    const generate = () =>
        run(async () => {
            setWriting(true);
            try {
                const result = await suggestCopy({ ...voice, kind });
                setSuggestions(result.suggestions);
                return result.suggestions.length === 0 ? "No suggestions came back. Try again." : "Pick one to add it to your page.";
            } finally {
                setWriting(false);
            }
        });

    const addToPage = (text: string) =>
        run(async () => {
            const font = isHeading ? fonts.heading ?? fonts.body : fonts.body ?? fonts.heading;
            await sandboxProxy.addTextToPage(text, {
                postscriptName: font?.postscriptName,
                hex: isHeading ? primaryHex : undefined,
                fontSize: isHeading ? 48 : 20
            });
            return "Added to the page.";
        });

    const replaceSelected = (text: string) =>
        run(async () => {
            await settleSelection(sandboxProxy);
            return (await sandboxProxy.replaceSelectedText(text)) ? "Replaced the selected text." : "Select a text item on the canvas first.";
        });

    return (
        <section>
            <label className="field">
                <span>Brand name</span>
                <input type="text" className="text" maxLength={80} value={voice.brandName} onChange={e => onVoiceChange({ ...voice, brandName: e.target.value })} />
            </label>
            <label className="field">
                <span>What you do, and for whom</span>
                <textarea
                    className="text"
                    rows={3}
                    maxLength={400}
                    placeholder="Example: Independent bookshop and cafe for curious readers in Brooklyn"
                    value={voice.description}
                    onChange={e => onVoiceChange({ ...voice, description: e.target.value })}
                />
            </label>
            <div className="row noMargin">
                <label className="field grow">
                    <span>Tone</span>
                    <select value={voice.tone} onChange={e => onVoiceChange({ ...voice, tone: e.target.value })}>
                        {TONES.map(t => (
                            <option key={t}>{t}</option>
                        ))}
                    </select>
                </label>
                <label className="field grow">
                    <span>Write a</span>
                    <select
                        value={kind}
                        onChange={e => {
                            setKind(e.target.value);
                            setSuggestions([]);
                        }}
                    >
                        {KINDS.map(k => (
                            <option key={k.id} value={k.id}>
                                {k.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <button className="primary" disabled={!ready || writing} onClick={generate}>
                {writing ? "Writing…" : suggestions.length ? "Suggest more" : "Suggest copy"}
            </button>
            <p className="hint">Suggestions are written by AI from the details above. Review them before you publish.</p>

            {suggestions.length > 0 && (
                <ul className="copyList">
                    {suggestions.map((text, i) => (
                        <li key={i}>
                            <p>{text}</p>
                            <div className="slotActions">
                                <button className="mini" onClick={() => addToPage(text)}>
                                    Add to page
                                </button>
                                <button className="mini" onClick={() => replaceSelected(text)}>
                                    Replace selected text
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

export default CopyTab;
