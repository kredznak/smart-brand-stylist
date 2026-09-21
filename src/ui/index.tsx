import React from "react";
import { createRoot } from "react-dom/client";
import { SandboxProxy } from "../shared/DocumentSandboxApi";
import { guarded } from "./timeout";
import App from "./components/App";

import addOnUISdk, { RuntimeType } from "https://new.express.adobe.com/static/add-on-sdk/sdk.js";

addOnUISdk.ready.then(async () => {
    const { runtime } = addOnUISdk.instance;
    // Proxy to the functions exposed by src/sandbox/code.ts
    const sandboxProxy: SandboxProxy = guarded(await runtime.apiProxy(RuntimeType.documentSandbox));

    const root = createRoot(document.getElementById("root"));
    root.render(<App addOnUISdk={addOnUISdk} sandboxProxy={sandboxProxy} />);
});
