# Développement

## Build

**Firefox** : aucun build n'est nécessaire, JavaScript vanilla sans
dépendance. Le dossier `prayer-reminder/` est directement chargeable tel
quel.

**Chrome / Edge** : un seul petit script d'assemblage (`node
scripts/build-chromium.js`, natif, sans dépendance) copie les dossiers
partagés avec Firefox + `chromium/` dans `dist/chromium/`, chargeable
tel quel. Nécessaire uniquement parce que Chrome/Edge exigent un fichier
`manifest.json` littéralement nommé ainsi à la racine du dossier chargé
et n'acceptent pas les chemins remontant hors du dossier (`../`) — donc
Firefox et Chromium ne peuvent pas partager un seul et même dossier
racine avec deux manifests différents. Voir
[docs/architecture.md](architecture.md#portage-chromeedge) pour le détail
des différences (service worker, document offscreen pour l'Adhan, etc.).

## Installation temporaire dans Firefox

1. Ouvrir `about:debugging#/runtime/this-firefox`.
2. Cliquer sur **Charger un module complémentaire temporaire**.
3. Sélectionner le fichier `manifest.json` de ce dossier.
4. L'icône apparaît dans la barre d'outils.

L'extension reste installée jusqu'à la fermeture de Firefox (rechargez-la
après chaque modification du code via le bouton **Recharger** de
`about:debugging`). Alternative pour le développement : `web-ext run
--source-dir .` (recharge automatiquement à chaque changement de fichier).

## Installation temporaire dans Chrome / Edge

1. `node scripts/build-chromium.js` (assemble `dist/chromium/`).
2. `chrome://extensions` (ou `edge://extensions`), activer le **mode
   développeur** (coin supérieur droit).
3. **Charger l'extension non empaquetée** → sélectionner le dossier
   `dist/chromium/`.
4. Après une modification du code : relancer le script de build, puis
   cliquer sur l'icône de rechargement de l'extension dans la page
   `chrome://extensions`.

Même paquet pour Chrome et Edge (tous deux Chromium, MV3) — un seul
build sert les deux.

## Premier lancement

À l'installation, un onglet de bienvenue s'ouvre automatiquement
(3 écrans : accueil → localisation → confirmation). Il peut aussi être
rouvert manuellement en ouvrant `onboarding/onboarding.html` depuis
`about:debugging` → "Inspecter", ou en cliquant sur "Configurer" dans le
popup tant qu'aucune localisation n'est définie.

## Fichier audio Adhan

`audio/adhan.mp3` n'est **pas fourni** (voir `audio/README.md`) : ajoutez
votre propre fichier, dont vous avez les droits d'utilisation, à cet
emplacement exact. Sans ce fichier, le toggle "Adhan" reste fonctionnel
mais aucun son ne sera joué (échec silencieux, loggué en console).

## Tests automatisés

Les tests utilisent uniquement le test runner intégré à Node.js
(`node:test`), sans dépendance externe.

```bash
node --test
```

(depuis le dossier `prayer-reminder/` ; `node --test tests/` avec un
slash final échoue sur certaines versions de Node qui tentent de
`require("tests")` comme un module — utiliser `node --test` sans
argument, qui découvre automatiquement les fichiers `*.test.js`.)

Fichiers de tests :
- `tests/prayer.test.js` — calcul, arrondi, prochaine/courante prière, état "en cours", golden dataset Habous.
- `tests/location.test.js` — villes marocaines, validation de coordonnées, erreurs de géolocalisation.
- `tests/storage.test.js` — configuration inexistante/corrompue, migration.
- `tests/scheduler.test.js` — alarmes, badge, dédoublonnage, réveil tardif, notifications manquées après veille prolongée, notifications/Adhan activés/désactivés (avec un faux `browser.*` en mémoire, voir `tests/helpers/`).
- `tests/notification.test.js` — détection d'environnement (Firefox `Audio` direct vs Chrome/Edge document offscreen), sélection de l'icône de notification selon le navigateur.

**État actuel : 38 tests, 38 réussis**, exécutés avec Node.js v24.19.0
(LTS) — golden dataset Habous inclus (9 points, 8 villes + 1 point
hiver, sourcés depuis habous.gov.ma, voir `docs/calculation.md` pour le
détail et la correction +5 min Dhuhr/Maghrib qui en a résulté).

Test réel effectué dans Firefox via `web-ext run` : l'extension se charge
sans erreur (un bug de scope global entre scripts du background — voir
`core/*.js`, chaque module est enveloppé dans une IIFE — a été trouvé et
corrigé grâce à ce test). La lecture de l'Adhan popup fermé reste à
valider manuellement sur la durée (voir `docs/architecture.md`).

## Validation du manifest (`web-ext lint`)

```bash
npx web-ext lint --source-dir .
```

(Exécuter sur un dossier propre, sans `dist/` généré, sinon
`web-ext lint` scanne aussi la copie Chromium et double certains
avertissements — `dist/` est de toute façon ignoré par git.)

Résultat actuel : **0 erreur, 1 avertissement, 0 notice** :

- `strict_min_version: "142.0"`, requis par
  `browser_specific_settings.gecko.data_collection_permissions`,
  obligatoire depuis le 3 novembre 2025 pour toute nouvelle extension
  Firefox — voir [Firefox Extension Workshop](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).
  `data_collection_permissions.required` est fixé à `["none"]` :
  conforme à la confidentialité voulue pour le projet (aucune donnée
  collectée).
- `UNSUPPORTED_API` sur `chrome.offscreen.createDocument` dans
  `core/notification.js` : attendu et sans conséquence — cet appel n'est
  fait que dans la branche `isChromiumServiceWorker()`, jamais exécutée
  sur Firefox (voir `docs/architecture.md`) ; l'analyse statique du
  linter ne peut pas le savoir.

## Permissions utilisées

- `alarms` — planification des rappels de prière et du badge, sans timer permanent.
- `notifications` — notification système à l'heure de chaque prière.
- `storage` — configuration locale (`browser.storage.local`).
- `geolocation` (**optionnelle**, demandée uniquement si l'utilisateur clique sur "Utiliser ma position") — jamais envoyée à un serveur.
- `offscreen` (**Chrome/Edge uniquement**) — document caché nécessaire pour jouer l'Adhan, le service worker n'ayant pas de DOM. Ignorée par Firefox (n'apparaît pas dans son manifest).

Aucune permission `tabs`, `cookies`, `webRequest`, `history`,
`bookmarks` ni `<all_urls>` n'est utilisée.

## Limitations connues

- Fichier `audio/adhan.mp3` non fourni (voir ci-dessus).
- Golden dataset Habous : 9 points (8 villes été 2026 + 1 point hiver 2024, voir `docs/calculation.md`) — un point printemps/automne supplémentaire renforcerait encore la confiance, mais le site officiel n'expose que le mois courant.
- Lecture Adhan en arrière-plan : mitigation par keepalive implémentée (voir `docs/architecture.md`) et pipeline testé unitairement (`tests/scheduler.test.js`), mais la fiabilité sur une lecture longue popup fermé reste à valider manuellement dans la durée.
- Build Chromium vérifié dans un vrai Edge pendant le développement (service worker, popup, options, sélection de ville, pipeline Adhan → document offscreen) via le protocole DevTools, mais pas encore publié/testé sur le Chrome Web Store ou Microsoft Edge Add-ons.
- Golden dataset Habous validé pour le calcul (identique quel que soit le navigateur, `core/prayer.js` est partagé) — voir `docs/calculation.md`.

## Structure du projet

```
manifest.json                     Firefox (MV3, event page)
background/background.js          partagé (écouteurs browser.*)
core/{timezone,storage,prayer,location,scheduler,notification}.js  partagé
popup/, options/, onboarding/     partagés (HTML/CSS/JS, aucune logique métier)
shared/theme.js                   partagé, thème clair/sombre/système
data/cities-ma.json               partagé, 20 villes marocaines
vendor/adhan.umd.min.js           partagé, Adhan JS (MIT), vendoré localement
vendor/webextension-polyfill.js   partagé, polyfill Mozilla (no-op sur Firefox)
audio/                            partagé, adhan.mp3 à fournir (voir audio/README.md)
icons/icon.svg                    Firefox (icônes SVG acceptées)
chromium/                         propre à Chrome/Edge :
  manifest.json                     MV3 (service_worker)
  background-entry.js               importScripts() -> core/*.js puis background/background.js
  offscreen.html, offscreen.js      lecture Adhan (pas de DOM dans le service worker)
  icons/icon-{16,32,48,128}.png     PNG obligatoire (SVG non supporté)
scripts/build-chromium.js         assemble dist/chromium/ (partagés + chromium/)
tests/                            node:test, zéro dépendance
docs/architecture.md, docs/calculation.md, docs/development.md
```
