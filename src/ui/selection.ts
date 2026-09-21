import { SandboxProxy } from "../shared/DocumentSandboxApi";

const ATTEMPTS = 6;
const GAP_MS = 60;

/**
 * Waits for Express to report a selection before a selection-dependent action runs.
 *
 * The first press in the panel after selecting something on the canvas arrives while
 * focus is still moving off the canvas, and in that moment Express reports no selection
 * at all; a second press a little later sees it. Polling the live selection for a few
 * hundred milliseconds covers that gap. Only the live reading is ever used, so the worst
 * case is the action reporting that nothing is selected, as it would have anyway. The
 * document sandbox has no timers of its own, which is why this waits on the panel side.
 */
export async function settleSelection(sandboxProxy: SandboxProxy): Promise<void> {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const { selected, locked } = await sandboxProxy.describeSelection();
        if (selected > 0 || locked > 0) return;
        await new Promise(resolve => setTimeout(resolve, GAP_MS));
    }
}
