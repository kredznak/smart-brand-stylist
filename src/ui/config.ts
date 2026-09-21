// Where the AI helper server lives.
//
// The panel is served from localhost only while you are testing locally, so the
// address is chosen from that rather than edited by hand. A build you forget to
// change therefore still points at the deployed server instead of your laptop.
//
// Before submitting to Adobe: deploy the server (see server/README.md) and paste
// the URL wrangler prints into PRODUCTION_API_BASE below.
const PRODUCTION_API_BASE = "https://smart-brand-stylist-api.red-surf-5c86.workers.dev";

const LOCAL_API_BASE = "http://localhost:8787";

const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";

export const API_BASE = isLocal ? LOCAL_API_BASE : PRODUCTION_API_BASE;
