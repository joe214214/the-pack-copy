/**
 * Turns the installer templates into TypeScript modules the web app can import.
 *
 *   node thepack-mcpb/release/build-templates.mjs
 *
 * Why not read the .tpl files at request time? A serverless deploy has no
 * reliable path to files outside the app bundle, so the templates have to be
 * compiled in. Editing the .tpl and re-running this is the supported loop —
 * the generated .ts files carry a header saying so.
 *
 * The escaping is done here rather than by hand because these scripts are full
 * of the three characters a TS template literal treats specially: backslashes
 * (printf '%s\n'), backticks (PowerShell's escape character) and ${ (every
 * shell variable expansion).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "..", "the-pack-main", "src", "lib", "installer");

/** Escape a raw file so it can sit inside a TS template literal verbatim. */
function escapeForTemplateLiteral(source) {
  return source
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

const files = [
  {
    src: "install.sh.tpl",
    out: "install-sh.ts",
    name: "INSTALL_SH_TEMPLATE",
    what: "macOS / Linux",
  },
  {
    src: "install.ps1.tpl",
    out: "install-ps1.ts",
    name: "INSTALL_PS1_TEMPLATE",
    what: "Windows",
  },
];

mkdirSync(outDir, { recursive: true });

for (const f of files) {
  const raw = readFileSync(join(here, f.src), "utf8").replace(/\r\n/g, "\n");
  const header = `/**
 * ${f.what} installer template — GENERATED, do not edit.
 *
 * Source: thepack-mcpb/release/${f.src}
 * Regenerate: node thepack-mcpb/release/build-templates.mjs
 *
 * Placeholders are filled in by src/lib/installer/render.ts.
 */
`;
  const body = `${header}\nexport const ${f.name} = \`${escapeForTemplateLiteral(raw)}\`;\n`;
  writeFileSync(join(outDir, f.out), body);
  console.log(`${f.out}  <-  ${f.src}  (${raw.length} chars)`);
}

console.log("\nDone. Templates compiled into the web app.");
