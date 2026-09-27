// Préparation en une commande (Windows, macOS, Linux) : npm run setup
// 1. crée .env à partir de .env.example avec des secrets générés (si .env n'existe pas)
// 2. génère le client Prisma  3. crée la base SQLite  4. charge les données MS MOBILE
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { execSync } from "node:child_process";

const major = Number(process.versions.node.split(".")[0]);
if (major < 20) { console.error(`\n✘ Node.js ${process.versions.node} est trop ancien. Installez Node.js 22 (LTS) depuis https://nodejs.org puis relancez.\n`); process.exit(1); }

const run = (label, cmd) => { console.log(`\n▶ ${label}`); execSync(cmd, { stdio: "inherit" }); };

if (existsSync(".env")) console.log("✔ .env existe déjà : conservé tel quel.");
else {
  const secrets = { ENCRYPTION_KEY: randomBytes(32).toString("base64"), SESSION_SECRET: randomBytes(32).toString("base64"), CRON_SECRET: randomBytes(16).toString("hex") };
  let env = readFileSync(".env.example", "utf8");
  for (const [k, v] of Object.entries(secrets)) env = env.replace(new RegExp(`^${k}=.*$`, "m"), `${k}="${v}"`);
  writeFileSync(".env", env);
  console.log("✔ .env créé avec des secrets générés.");
}

run("Génération du client Prisma", "npx prisma generate");
run("Création de la base de données (dev.db)", "npx prisma migrate deploy");
run("Chargement des données de démonstration MS MOBILE", "npm run db:seed");

console.log(`
✔ Prêt. Lancez maintenant :

    npm run dev

puis ouvrez http://localhost:3000 dans votre navigateur.
Compte : admin@msmobile.example.test   Mot de passe : demo1234
`);
