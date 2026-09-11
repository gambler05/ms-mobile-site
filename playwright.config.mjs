import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    headless: true,
    // Chromium pré-installé de l'environnement : aucun téléchargement.
    launchOptions: { executablePath: process.env.MS_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
    // Le fichier est autonome : aucun serveur n'est nécessaire.
    baseURL: 'file://' + process.cwd() + '/dist/',
  },
});
