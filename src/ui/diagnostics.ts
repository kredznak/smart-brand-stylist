// A small in-panel log of what each action did, for working out why something that
// looks fine in a local reproduction behaves differently inside Express. Shown in a
// collapsed "Diagnostics" section; remove once the Fonts tab is understood.

type Listener = (lines: string[]) => void;

const MAX_LINES = 40;
const lines: string[] = [];
const listeners = new Set<Listener>();
const stamp = () => new Date().toISOString().slice(11, 23);

export function log(message: string): void {
    lines.push(`${stamp()} ${message}`);
    if (lines.length > MAX_LINES) lines.shift();
    for (const listener of listeners) listener([...lines]);
}

export function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    listener([...lines]);
    return () => {
        listeners.delete(listener);
    };
}

let installed = false;
export function captureGlobalErrors(): void {
    if (installed) return;
    installed = true;
    window.addEventListener("error", e => log(`window error: ${e.message}`));
    window.addEventListener("unhandledrejection", e =>
        log(`unhandled rejection: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`)
    );
}
