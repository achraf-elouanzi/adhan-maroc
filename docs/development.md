# Développement

## Build

Aucun build n'est nécessaire : JavaScript vanilla, aucune dépendance npm,
aucun bundler. Le dossier `prayer-reminder/` est directement chargeable
tel quel.

## Installation temporaire dans Firefox

1. Ouvrir `about:debugging#/runtime/this-firefox`.
2. Cliquer sur **Charger un module complémentaire temporaire**.
3. Sélectionner le fichier `manifest.json` de ce dossier.
4. L'icône apparaît dans la barre d'outils.

L'extension reste installée jusqu'à la fermeture de Firefox (rechargez-la
après chaque modification du code via le bouton **Recharger** de
`about:debugging`). Alternative pour le développement : `web-ext run
--source-dir .` (recharge automatiquement à chaque changement de fichier).

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
- `tests/prayer.test.js` — calcul, arrondi, prochaine/courante prière, golden dataset Habous.
- `tests/location.test.js` — villes marocaines, validation de coordonnées, erreurs de géolocalisation.
- `tests/storage.test.js` — configuration inexistante/corrompue, migration.
- `tests/scheduler.test.js` — alarmes, badge, dédoublonnage, réveil tardif, notifications/Adhan activés/désactivés (avec un faux `browser.*` en mémoire, voir `tests/helpers/`).

**État actuel : 27 tests, 27 réussis**, exécutés avec Node.js v24.19.0
(LTS) le 26/08/2026 — golden dataset Habous inclus (9 points, 8 villes +
1 point hiver, sourcés depuis habous.gov.ma, voir `docs/calculation.md`
pour le détail et la correction +5 min Dhuhr/Maghrib qui en a résulté).

Test réel effectué dans Firefox via `web-ext run` : l'extension se charge
sans erreur (un bug de scope global entre scripts du background — voir
`core/*.js`, chaque module est enveloppé dans une IIFE — a été trouvé et
corrigé grâce à ce test). La lecture de l'Adhan popup fermé reste à
valider manuellement sur la durée (voir `docs/architecture.md`).

## Validation du manifest (`web-ext lint`)

```bash
npx web-ext lint --source-dir .
```

Résultat actuel : **0 erreur, 0 avertissement, 0 notice**
(`strict_min_version: "142.0"`, requis par
`browser_specific_settings.gecko.data_collection_permissions`, obligatoire
depuis le 3 novembre 2025 pour toute nouvelle extension Firefox — voir
[Firefox Extension Workshop](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)).
`data_collection_permissions.required` est fixé à `["none"]` : conforme à
la confidentialité voulue pour le projet (aucune donnée collectée).

## Permissions utilisées

- `alarms` — planification des rappels de prière et du badge, sans timer permanent.
- `notifications` — notification système à l'heure de chaque prière.
- `storage` — configuration locale (`browser.storage.local`).
- `geolocation` (**optionnelle**, demandée uniquement si l'utilisateur clique sur "Utiliser ma position") — jamais envoyée à un serveur.

Aucune permission `tabs`, `cookies`, `webRequest`, `history`,
`bookmarks` ni `<all_urls>` n'est utilisée.

## Limitations connues

- Fichier `audio/adhan.mp3` non fourni (voir ci-dessus).
- Golden dataset Habous : 9 points (8 villes été 2026 + 1 point hiver 2024, voir `docs/calculation.md`) — un point printemps/automne supplémentaire renforcerait encore la confiance, mais le site officiel n'expose que le mois courant.
- Lecture Adhan en arrière-plan : mitigation par keepalive implémentée (voir `docs/architecture.md`) et pipeline testé unitairement (`tests/scheduler.test.js`), mais la fiabilité sur une lecture longue popup fermé reste à valider manuellement dans la durée.
- Cible unique Firefox pour la V1 ; la séparation `core/` / `background/` facilite un portage Chromium ultérieur mais celui-ci n'est pas implémenté.

## Structure du projet

```
manifest.json
background/background.js
core/{timezone,storage,prayer,location,scheduler,notification}.js
popup/, options/, onboarding/     interfaces (HTML/CSS/JS, aucune logique métier)
shared/theme.js                   thème clair/sombre/système
data/cities-ma.json               20 villes marocaines
vendor/adhan.umd.min.js           Adhan JS (MIT), vendoré localement
audio/                            adhan.mp3 à fournir (voir audio/README.md)
icons/icon.svg
tests/                            node:test, zéro dépendance
docs/architecture.md, docs/calculation.md, docs/development.md
```
