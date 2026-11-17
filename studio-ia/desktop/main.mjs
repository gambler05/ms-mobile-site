/**
 * Studio IA — application de bureau (Electron).
 *
 * Démarre le serveur du studio à l'intérieur de l'application, sur 127.0.0.1 uniquement,
 * puis l'affiche dans une fenêtre dédiée. Les données (bibliothèque, images, réglages et clés)
 * sont rangées dans le dossier utilisateur du système :
 *   Windows : %APPDATA%\Studio IA\data
 *   macOS   : ~/Library/Application Support/Studio IA/data
 *   Linux   : ~/.config/Studio IA/data
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, BrowserWindow, dialog, Menu, shell } from "electron";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const PREFERRED_PORT = 5174;

app.setName("Studio IA");

// Une seule instance : un second lancement remet la fenêtre existante au premier plan.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let baseUrl = "";

async function startServer() {
  const userData = app.getPath("userData");
  // Fichier .env facultatif dans le dossier utilisateur (clés API, réglages avancés).
  dotenv.config({ path: path.join(userData, ".env"), quiet: true });
  process.env.DATA_DIR = process.env.DATA_DIR || path.join(userData, "data");
  process.env.HOST = "127.0.0.1";

  const { createApp } = await import(pathToFileURL(path.join(ROOT, "server", "dist", "app.js")).href);
  const { app: server } = createApp({ quiet: true });

  // Port fixe si possible (les préférences d'interface y restent attachées), sinon le suivant libre.
  for (let port = PREFERRED_PORT; port < PREFERRED_PORT + 20; port++) {
    const ok = await new Promise((resolve) => {
      const srv = server.listen(port, "127.0.0.1", () => resolve(true));
      srv.once("error", () => resolve(false));
    });
    if (ok) return `http://127.0.0.1:${port}`;
  }
  throw new Error("Aucun port libre entre 5174 et 5193.");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 380,
    minHeight: 560,
    title: "Studio IA",
    backgroundColor: "#08080c",
    icon: path.join(here, "icon.png"),
    show: false,
    autoHideMenuBar: process.platform !== "darwin",
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Les liens externes (tarifs, documentation…) s'ouvrent dans le navigateur habituel.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !url.startsWith(baseUrl)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(baseUrl)) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });
  mainWindow.on("closed", () => (mainWindow = null));
  void mainWindow.loadURL(baseUrl);
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ label: "Studio IA", submenu: [{ role: "about", label: "À propos de Studio IA" }, { type: "separator" }, { role: "quit", label: "Quitter Studio IA" }] }] : []),
    {
      label: "Fichier",
      submenu: [
        { label: "Ouvrir le dossier des données", click: () => void shell.openPath(process.env.DATA_DIR) },
        { label: "Ouvrir dans le navigateur", click: () => void shell.openExternal(baseUrl) },
        { type: "separator" },
        isMac ? { role: "close", label: "Fermer la fenêtre" } : { role: "quit", label: "Quitter" },
      ],
    },
    {
      label: "Édition",
      submenu: [
        { role: "undo", label: "Annuler" },
        { role: "redo", label: "Rétablir" },
        { type: "separator" },
        { role: "cut", label: "Couper" },
        { role: "copy", label: "Copier" },
        { role: "paste", label: "Coller" },
        { role: "selectAll", label: "Tout sélectionner" },
      ],
    },
    {
      label: "Affichage",
      submenu: [
        { role: "reload", label: "Actualiser" },
        { type: "separator" },
        { role: "resetZoom", label: "Taille réelle" },
        { role: "zoomIn", label: "Zoom avant" },
        { role: "zoomOut", label: "Zoom arrière" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Plein écran" },
        { role: "toggleDevTools", label: "Outils de développement" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on("window-all-closed", () => app.quit());

app.whenReady().then(async () => {
  try {
    baseUrl = await startServer();
  } catch (err) {
    dialog.showErrorBox("Studio IA ne peut pas démarrer", String(err instanceof Error ? err.message : err));
    app.quit();
    return;
  }
  buildMenu();
  createWindow();
  app.on("activate", () => {
    if (!mainWindow) createWindow();
  });
});
