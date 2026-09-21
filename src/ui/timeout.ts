import { SandboxProxy } from "../shared/DocumentSandboxApi";

const CALL_TIMEOUT_MS = 10000;

/**
 * Every call into the document sandbox, with a time limit.
 *
 * A call that never answers leaves the panel with nothing to say, which is exactly what
 * a broken button looks like; that cost a long time to find once already. Wrapping the
 * proxy once covers every action, including any added later, which hand-wrapping the
 * call sites did not.
 */
// Every method the sandbox exposes. Listed by hand rather than trapped generically:
// a Proxy that wraps whatever is asked for also wraps toString, valueOf and
// Symbol.toPrimitive, turning them into functions that return promises, and anything
// that converts the object to a string then fails with "cannot convert object to
// primitive value". The RPC proxy also gives meaning to `then`, which must not be
// wrapped either.
const SANDBOX_METHODS = [
    "build",
    "describeSelection",
    "auditPage",
    "fixOffBrandColors",
    "applyColorToSelection",
    "addPaletteToPage",
    "getAvailableFonts",
    "getSelectionFont",
    "loadFont",
    "applyFontToSelection",
    "auditFonts",
    "fixOffBrandFonts",
    "addTextToPage",
    "replaceSelectedText"
] as const;

// A method added to DocumentSandboxApi but missed above would quietly go unguarded,
// so make that a compile error that names it.
type Unlisted = Exclude<keyof SandboxProxy, (typeof SANDBOX_METHODS)[number]>;
const allMethodsListed: Unlisted extends never ? true : ["unguarded sandbox method", Unlisted] = true;
void allMethodsListed;

/**
 * Every call into the document sandbox, with a time limit.
 *
 * A call that never answers leaves the panel with nothing to say, which is exactly what
 * a broken button looks like; that cost a long time to find once already.
 */
export function guarded(proxy: SandboxProxy): SandboxProxy {
    const wrapped: Record<string, unknown> = {};
    for (const name of SANDBOX_METHODS) {
        wrapped[name] = (...args: unknown[]) =>
            withTimeout(
                (proxy[name] as (...a: unknown[]) => Promise<unknown>)(...args),
                CALL_TIMEOUT_MS,
                "Express did not respond. Try again, and reload the page if it keeps happening."
            );
    }
    return wrapped as unknown as SandboxProxy;
}

/**
 * Turns a sandbox call that never answers into an error with a message. Without this
 * a stalled call leaves the panel silent, which is indistinguishable from a dead button.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), ms);
        promise.then(
            value => {
                clearTimeout(timer);
                resolve(value);
            },
            error => {
                clearTimeout(timer);
                reject(error);
            }
        );
    });
}
