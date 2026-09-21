import { API_BASE } from "./config";

export class ApiError extends Error {}

async function post<T>(path: string, body: unknown): Promise<T> {
    let response: Response;
    try {
        response = await fetch(API_BASE + path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
    } catch {
        throw new ApiError("The AI server isn't reachable. Start it with the steps in server/README.md.");
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw new ApiError((data && data.error) || `The AI server returned an error (${response.status}).`);
    }
    return data as T;
}

export interface CopyRequest {
    brandName: string;
    description: string;
    tone: string;
    kind: string;
}

export const suggestCopy = (request: CopyRequest) => post<{ suggestions: string[] }>("/suggest-copy", request);

export interface FontSuggestion {
    pairingId: string;
    reason: string;
}

export const suggestFonts = (logo: string, pairings: { id: string; label: string; mood: string }[]) =>
    post<FontSuggestion>("/suggest-fonts", { logo, pairings });
