// Curated heading + body pairings, by PostScript name.
// At startup the add-on asks Express which of these the user can actually use,
// and only shows pairings where both fonts are available.

export interface Pairing {
    id: string;
    label: string;
    mood: string;
    heading: string;
    body: string;
}

export const PAIRINGS: Pairing[] = [
    { id: "modern", label: "Modern", mood: "clean, tech, approachable", heading: "Poppins-SemiBold", body: "OpenSans-Regular" },
    { id: "clean", label: "Clean", mood: "neutral, professional, corporate", heading: "Montserrat-Bold", body: "Lato-Regular" },
    { id: "editorial", label: "Editorial", mood: "refined, magazine, premium", heading: "PlayfairDisplay-Bold", body: "SourceSans3-Regular" },
    { id: "classic", label: "Classic", mood: "traditional, trustworthy, literary", heading: "LibreBaskerville-Bold", body: "Lato-Regular" },
    { id: "bold", label: "Bold", mood: "strong, sporty, condensed", heading: "Oswald-Bold", body: "Roboto-Regular" },
    { id: "impact", label: "Impact", mood: "loud, poster, all caps", heading: "BebasNeue-Regular", body: "Montserrat-Regular" },
    { id: "friendly", label: "Friendly", mood: "rounded, warm, welcoming", heading: "Nunito-Bold", body: "Nunito-Regular" },
    { id: "playful", label: "Playful", mood: "fun, soft, youthful", heading: "Quicksand-Bold", body: "OpenSans-Regular" },
    { id: "elegant", label: "Elegant", mood: "luxury, fashion, high contrast serif", heading: "DMSerifDisplay-Regular", body: "Raleway-Regular" },
    { id: "warm", label: "Warm", mood: "crafted, human, bookish", heading: "Lora-Bold", body: "WorkSans-Regular" }
];

export const ALL_FONT_NAMES = [...new Set(PAIRINGS.flatMap(p => [p.heading, p.body]))];

const compare = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Catalog fonts matching the CSS families a website uses, keeping the order the
 * site suggested. "Open Sans" on a page becomes "OpenSans-Regular" here.
 */
export function catalogNamesForFamilies(families: string[]): string[] {
    const byFamily = new Map<string, string[]>();
    for (const name of ALL_FONT_NAMES) {
        const key = compare(name.split("-")[0]);
        byFamily.set(key, [...(byFamily.get(key) ?? []), name]);
    }

    const matches: string[] = [];
    for (const family of families) {
        for (const name of byFamily.get(compare(family)) ?? []) {
            if (!matches.includes(name)) matches.push(name);
        }
    }
    return matches;
}
