/**
 * scripts/build-chromium.js
 *
 * Assemble un dossier chargeable tel quel dans Chrome/Edge
 * ("Charger l'extension non empaquetée") : copie les dossiers partagés
 * avec Firefox + les fichiers propres à Chromium (chromium/) dans
 * dist/chromium/.
 *
 * Volontairement un script Node natif sans dépendance (fs/path
 * seulement) : ni bundler ni framework, juste une copie de fichiers —
 * voir la section "Aucune sur-ingénierie" du cahier des charges.
 *
 * Usage : node scripts/build-chromium.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "dist", "chromium");

// Dossiers/fichiers partagés avec Firefox, copiés tels quels.
const SHARED_ENTRIES = [
  "core",
  "popup",
  "options",
  "onboarding",
  "shared",
  "data",
  "vendor",
  "audio",
  "background",
];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function main() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const entry of SHARED_ENTRIES) {
    copyRecursive(path.join(ROOT, entry), path.join(OUT_DIR, entry));
  }

  // Fichiers propres à Chromium (manifest MV3, service worker, offscreen, icônes PNG).
  copyRecursive(path.join(ROOT, "chromium"), OUT_DIR);

  console.log(`Build Chromium prêt : ${path.relative(ROOT, OUT_DIR)}`);
  console.log('Chrome/Edge -> "Charger l\'extension non empaquetée" -> sélectionner ce dossier.');
}

main();
