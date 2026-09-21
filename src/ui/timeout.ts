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
export function guarded(proxy: SandboxProxy): SandboxProxy {
    return new Proxy(proxy, {
        get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (typeof value !== "function") return value;
            return (...args: unknown[]) =>
                withTimeout(
                    (value as (...a: unknown[]) => Promise<unknown>).apply(target, args),
                    CALL_TIMEOUT_MS,
                    "Express did not respond. Try again, and reload the page if it keeps happening."
                );
        }
    }) as SandboxProxy;
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
