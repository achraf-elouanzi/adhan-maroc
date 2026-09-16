<p align="center">
  <img src="icons/icon.svg" width="88" alt="Adhan Maroc" />
</p>

<h1 align="center">Adhan Maroc</h1>

<p align="center">
  Les horaires de prière au Maroc, directement dans votre navigateur.<br/>
  Firefox, Chrome, Edge — 100% local, hors ligne, sans compte, sans tracking.
</p>

---

## ✨ Fonctionnalités

- 🕌 Les 5 prières du jour + heure du lever du soleil
- ⏭️ Prochaine prière et compte à rebours en temps réel
- 🔔 Notification native à l'heure de chaque prière, Adhan optionnel
- 📍 Sélection d'une ville marocaine ou géolocalisation
- 🌗 Thème clair / sombre / système, format 12h ou 24h
- 📡 Aucune connexion Internet requise une fois configuré

Calcul basé sur la méthode du Ministère des Habous et des Affaires
Islamiques (école malikite), validée par comparaison aux horaires
officiels — voir [docs/calculation.md](docs/calculation.md).

## 🔒 Confidentialité

Aucune donnée n'est envoyée à un serveur. Aucune télémétrie, aucun
analytics, aucune publicité. La localisation reste sur l'appareil.
Permissions minimales : `alarms`, `notifications`, `storage`, et
`geolocation` (optionnelle, demandée uniquement si vous l'activez).

## 🚀 Installation

Aucune version n'est encore publiée sur les stores (addons.mozilla.org,
Chrome Web Store, Microsoft Edge Add-ons). Installation manuelle :

**Firefox**
1. `about:debugging#/runtime/this-firefox`
2. **Charger un module complémentaire temporaire**
3. Sélectionner `manifest.json` à la racine de ce dossier

**Chrome / Edge** (même paquet pour les deux, un seul build Chromium)
1. `node scripts/build-chromium.js` (assemble `dist/chromium/`)
2. `chrome://extensions` ou `edge://extensions`, activer le **mode développeur**
3. **Charger l'extension non empaquetée** → sélectionner `dist/chromium/`

## 🛠️ Stack

JavaScript vanilla, aucun framework, aucun bundler. Calcul astronomique
via [Adhan JS](https://github.com/batoulapps/adhan-js) (vendoré
localement). Un seul jeu de fichiers `core/`/`popup/`/`options/` partagé
entre Firefox et Chromium (compatibilité via le
[polyfill Mozilla](https://github.com/mozilla/webextension-polyfill)) —
voir [docs/architecture.md](docs/architecture.md) pour le détail des
différences (event page vs service worker, document offscreen pour
l'Adhan côté Chrome/Edge).

## 📚 Documentation

- [docs/architecture.md](docs/architecture.md) — architecture, scheduler, notifications, Adhan
- [docs/calculation.md](docs/calculation.md) — méthode de calcul et validation
- [docs/development.md](docs/development.md) — build, tests, lint, structure du projet
