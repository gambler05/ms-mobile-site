import { createApp, VERSION } from "./app.js";
import { serverConfig } from "./config.js";

const { app, engines, dataDir } = createApp();

const server = app.listen(serverConfig.port, serverConfig.host, async () => {
  const url = `http://${serverConfig.host === "0.0.0.0" ? "localhost" : serverConfig.host}:${serverConfig.port}`;
  console.log(`\n  Studio IA ${VERSION}`);
  console.log(`  Interface : ${url}`);
  console.log(`  Données   : ${dataDir}\n`);
  if (serverConfig.host !== "127.0.0.1" && serverConfig.host !== "localhost") {
    console.warn("  ⚠ Le serveur écoute sur le réseau. Ne l'exposez jamais directement sur Internet.\n");
  }
  try {
    const status = await engines.status();
    for (const e of status) {
      const mark = e.available ? "✔" : e.configured ? "✖" : "·";
      console.log(`  ${mark} ${e.name.padEnd(26)} ${e.statusMessage}`);
    }
    if (!status.some((e) => e.available)) {
      console.log("\n  Aucun moteur connecté : ouvrez Paramètres › Moteurs dans l'interface pour en configurer un.");
    }
    console.log("");
  } catch {
    // L'état des moteurs est aussi visible dans l'interface.
  }
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Le port ${serverConfig.port} est déjà utilisé. Fermez l'autre application ou changez PORT dans le fichier .env.`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
