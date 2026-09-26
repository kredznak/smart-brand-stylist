// Renders PRIVACY.md, TERMS.md and HELP.md into docs/, which GitHub Pages serves.
//
// Generated rather than written twice: a privacy policy that disagrees with itself is
// worse than not having one, and two copies of a legal document drift the moment one is
// edited. PRIVACY.md is the source; this file is the published form of it.
//
// Run with: npm run pages

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));

const PAGES = [
    { source: "PRIVACY.md", output: "docs/index.html", description: "How the Smart Brand Stylist add-on for Adobe Express handles your information.", footer: "Policy" },
    { source: "TERMS.md", output: "docs/terms.html", description: "Terms of service for the Smart Brand Stylist add-on for Adobe Express.", footer: "Terms" },
    { source: "HELP.md", output: "docs/help.html", description: "How to use the Smart Brand Stylist add-on for Adobe Express.", footer: "Help" }
];

for (const page of PAGES) {
    await render(page);
}

async function render({ source, output, description, footer }) {
const markdown = await readFile(join(root, source), "utf8");

const escape = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Only the few things the document uses: bold, and bare links.
const inline = text =>
    escape(text)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(https?:\/\/[^\s,)]+[^\s,.)])/g, '<a href="$1">$1</a>');

const blocks = [];
let paragraph = [];
let list = [];

const flushParagraph = () => {
    if (paragraph.length) blocks.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
};
const flushList = () => {
    if (list.length) blocks.push(`<ul>\n${list.map(i => `  <li>${inline(i)}</li>`).join("\n")}\n</ul>`);
    list = [];
};
const flush = () => {
    flushParagraph();
    flushList();
};

for (const line of markdown.split("\n")) {
    const heading = line.match(/^(#{1,3}) (.*)$/);
    const item = line.match(/^- (.*)$/);

    if (heading) {
        flush();
        const level = heading[1].length;
        blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (item) {
        flushParagraph();
        list.push(item[1]);
    } else if (line.trim() === "") {
        flush();
    } else {
        flushList();
        paragraph.push(line.trim());
    }
}
flush();

const title = markdown.match(/^# (.*)$/m)?.[1] ?? "Privacy policy";
const updated = markdown.match(/Last updated: ([^*]+)/)?.[1].trim() ?? "";

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<style>
  :root {
    color-scheme: light dark;
    --bg: #ffffff; --text: #1b1b1f; --muted: #5a5a66; --rule: #e3e3e8; --link: #2b53c8;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #17171c; --text: #ececf1; --muted: #a9a9b4; --rule: #33333d; --link: #9db4ff; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 17px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main { max-width: 42rem; margin: 0 auto; padding: 4rem 1.25rem 6rem; }
  h1 { font-size: 2rem; line-height: 1.2; margin: 0 0 .5rem; letter-spacing: -0.01em; }
  h2 { font-size: 1.3rem; margin: 2.75rem 0 .75rem; padding-top: 1.75rem; border-top: 1px solid var(--rule); letter-spacing: -0.005em; }
  h3 { font-size: 1.05rem; margin: 1.75rem 0 .4rem; }
  p, li { margin: 0 0 1rem; }
  ul { padding-left: 1.2rem; margin: 0 0 1rem; }
  li { margin-bottom: .45rem; }
  a { color: var(--link); }
  a:hover { text-decoration: none; }
  strong { font-weight: 650; }
  p:first-of-type strong { color: var(--muted); font-weight: 500; }
  footer { margin-top: 4rem; padding-top: 1.5rem; border-top: 1px solid var(--rule); color: var(--muted); font-size: .9rem; }
  @media (max-width: 30rem) { main { padding: 2.5rem 1.1rem 4rem; } h1 { font-size: 1.6rem; } }
</style>
</head>
<body>
<main>
${blocks.join("\n")}
<footer>Smart Brand Stylist, an add-on for Adobe Express.${updated ? ` ${footer} last updated ${escape(updated)}.` : ""}</footer>
</main>
</body>
</html>
`;

await writeFile(join(root, output), html);
console.log(`${output} written (${html.length} bytes) from ${source}`);
}
