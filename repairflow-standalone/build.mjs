// Assemble src/shell.html + src/styles.css + src/js/*.js (ordre alphabétique) en un fichier autonome.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
const shell = readFileSync("src/shell.html", "utf8");
const css = readFileSync("src/styles.css", "utf8");
const files = readdirSync("src/js").filter((f) => f.endsWith(".js")).sort();
const js = files.map((f) => `/* ===== ${f} ===== */\n${readFileSync("src/js/" + f, "utf8")}`).join("\n\n");
// Vérification syntaxique avant assemblage : un bundle qui ne compile pas n'est pas produit.
mkdirSync("dist", { recursive: true });
writeFileSync("dist/.bundle-check.js", js);
execFileSync(process.execPath, ["--check", "dist/.bundle-check.js"], { stdio: "inherit" });
const out = shell.replace("/*__CSS__*/", () => css).replace("/*__JS__*/", () => js);
writeFileSync("dist/repairflow.html", out);
console.log(`dist/repairflow.html : ${(Buffer.byteLength(out) / 1024).toFixed(0)} Ko, ${files.length} modules`);
