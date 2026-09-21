// Replaced at bundle time (see DefinePlugin in webpack.config.js). Both the panel and
// the document sandbox are compiled together, so they carry the same value, and the
// panel can tell when Express is still running an older sandbox script.
declare const __BUILD__: string;

export const BUILD: string = __BUILD__;
