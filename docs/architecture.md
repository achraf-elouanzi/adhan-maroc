# Architecture — Adhan Maroc

## Vue d'ensemble

```
manifest.json (MV3, background.scripts — event page Firefox, PAS de service_worker)

vendor/adhan.umd.min.js      bibliothèque astronomique, vendorée localement (MIT)

core/
  timezone.js   seul point d'accès à Intl/fuseau horaire (Africa/Casablanca)
  storage.js    seul point d'accès à browser.storage.local, config versionnée
  prayer.js     façade sur Adhan JS : calcul + arrondi + prochaine/courante prière
  location.js   ville locale (data/cities-ma.json) ou géolocalisation navigateur
  scheduler.js  source de vérité pour les alarmes et le badge (self-healing)
  notification.js  effets de bord d'une prière : notification système + Adhan

background/background.js   écouteurs (onInstalled/onStartup/onAlarm/onMessage)
                            + délégation à core/scheduler.js

popup/, options/, onboarding/   UI. Aucune logique métier : tout passe par core/*
shared/theme.js   petit utilitaire d'application du thème (clair/sombre/système)
```

## Flux de données

**Popup** : ne dépend pas du scheduler. À l'ouverture, il lit la config
(`core/storage.js`) puis calcule directement, via `core/prayer.js`, les
horaires du jour et du lendemain. Un `setInterval` local (1s) anime
uniquement le compte à rebours affiché ; il est détruit à la fermeture du
popup. Aucun calcul astronomique n'est refait à chaque tick — seul un
`Date.now()` est comparé à l'horaire déjà calculé à l'ouverture.

**Background (event page)** : seule source de vérité pour les alarmes et
le badge. `core/scheduler.js#reconcile()` est appelé à l'installation, au
démarrage de Firefox, et à chaque chargement du script (l'event page est
rechargée à chaque réveil). `reconcile()` :

1. lit la config ;
2. supprime toutes les alarmes `prayer:*` existantes (idempotent) ;
3. si aucune localisation n'est configurée, vide le badge et s'arrête ;
4. sinon calcule les horaires du jour et du lendemain à l'heure réelle
   actuelle, programme une alarme pour chaque prière restante du jour (ou,
   si toutes sont passées, une alarme pour le Fajr du lendemain) ;
5. s'assure qu'une alarme périodique `badge-tick` (1×/min) existe ;
6. met à jour le badge.

Ce chemin unique gère indifféremment : premier lancement, redémarrage de
Firefox, réveil après veille prolongée, changement d'heure système,
changement de jour et changement de localisation — voir section
"Robustesse" ci-dessous.

## Gestion des alarmes (`browser.alarms`)

- `prayer:<dayKey>:<prayerKey>` — une alarme ponctuelle par prière restante.
- `badge-tick` — alarme périodique (1 min) qui recalcule le badge à partir
  de zéro (aucun cache astronomique conservé entre les ticks : le calcul
  est une opération JS pure de l'ordre de la milliseconde, donc le
  refaire à chaque minute est plus simple et plus fiable qu'un cache à
  invalider — voir section 41 du cahier des charges : fiabilité avant
  optimisation prématurée).

Au déclenchement d'une alarme de prière (`core/scheduler.js#handlePrayerAlarm`),
le nom de l'alarme est revérifié (jour + prière), un identifiant
`dayKey:prayerKey` est comparé à `lastFiredKey` (stocké dans
`browser.storage.local`) pour garantir qu'une prière n'est jamais
signalée deux fois — y compris si Firefox relivre une alarme en retard
après une veille prolongée. Les effets sont ensuite déclenchés
(`core/notification.js#firePrayerEffects`), puis `reconcile()` est
rappelé pour programmer la suite.

## Robustesse (veille, redémarrage, changement d'heure)

Le scheduler ne fait jamais confiance à une alarme pour connaître
« l'heure qu'il est » : `handlePrayerAlarm` et `reconcile` relisent
systématiquement `new Date()`. Une alarme qui se déclenche en retard (PC
sorti de veille longtemps après l'heure théorique) déclenche quand même
les effets une seule fois (grâce à `lastFiredKey`), puis `reconcile()`
recalcule immédiatement l'état correct pour la suite — aucune notification
tardive erronée n'est réémise pour une prière déjà passée depuis
longtemps, et aucune prière n'est oubliée.

Cas particulier : si le PC dort à travers plusieurs prières, Firefox
relivre toutes les alarmes en retard d'un coup à la reprise. Pour éviter
une rafale de notifications pour des prières manquées depuis longtemps,
`handlePrayerAlarm` compare l'heure réelle de la prière à `Date.now()` :
au-delà de `ONGOING_WINDOW_MINUTES` (15 min, la même fenêtre que l'état
"en cours" — voir ci-dessous) de retard, la notification n'est pas
affichée pour cette prière-là (l'état est quand même marqué comme traité
pour ne jamais la redéclencher). Une prière manquée de peu (≤ 15 min)
continue de notifier normalement.

## État "en cours" après une prière (popup + badge)

Une prière qui vient de sonner reste affichée comme "en cours" pendant
`ONGOING_WINDOW_MINUTES` (15 min, `core/prayer.js#findDisplayState`)
plutôt que de basculer instantanément sur le compte à rebours de la
prière suivante — aussi bien dans le popup (carte + liste, couleur
distincte) que dans le badge de la barre d'outils
(`core/scheduler.js#updateBadge`, qui affiche alors le temps restant de
cette fenêtre plutôt que le temps jusqu'à la prière suivante).

## Lecture de l'Adhan en arrière-plan (point technique le plus sensible)

Un background script Firefox (event page, avec DOM) peut lire de l'audio
sans geste utilisateur : la préférence
`media.autoplay.allow-extension-backgroundscripts` est activée par défaut
depuis Firefox 63 ([bug 1466926](https://bugzilla.mozilla.org/show_bug.cgi?id=1466926)).

Le risque réel n'est donc pas l'autoplay, mais le déchargement de l'event
page pour inactivité **pendant** la lecture (l'Adhan dure 1 à 4 minutes,
alors que Firefox peut décharger une event page inactive au bout de
quelques dizaines de secondes — voir
[bug 1851373](https://bugzilla.mozilla.org/show_bug.cgi?id=1851373)).
`core/notification.js#playAdhan` mitige ce risque avec un "keepalive" :
un appel à une API `browser.*` (ici `browser.storage.local.get`) toutes
les 20 secondes tant que l'audio joue, ce qui repousse le déchargement de
l'event page ; un garde-fou de 6 minutes coupe le keepalive si
l'événement `ended`/`error` ne se déclenche jamais.

**Procédure de test réelle à effectuer dans Firefox** (non automatisable,
à faire manuellement — voir `docs/architecture.md#tests` du présent
projet) :
1. Configurer un Adhan de test d'au moins 1 minute dans `audio/adhan.mp3`.
2. Fermer le popup de l'extension.
3. Déclencher une alarme de prière proche (ou avancer l'heure système de
   test) et vérifier que l'audio joue **jusqu'au bout**, popup fermé.
4. Si l'audio s'interrompt prématurément, augmenter la fréquence du
   keepalive ou investiguer via `about:debugging` → "Inspecter" sur le
   background script.

## Stockage

`browser.storage.local`, une seule clé `prayerReminderConfig`, structure
versionnée (`schemaVersion`). `core/storage.js#migrate()` répare tout
champ manquant ou invalide en le remplaçant par sa valeur par défaut —
l'extension ne peut donc pas se retrouver bloquée par une configuration
inexistante ou corrompue (voir tests/storage.test.js).

## Portage Chrome/Edge

Un seul jeu de fichiers `core/`, `popup/`, `options/`, `onboarding/`,
`shared/`, `data/`, `vendor/`, `audio/` et `background/background.js`
est partagé entre les deux builds — voir `chromium/` pour ce qui est
propre à Chrome/Edge, et `scripts/build-chromium.js` pour l'assemblage.
Chrome et Edge utilisent le même moteur (Chromium) et acceptent le même
paquet MV3 : un seul build sert les deux.

**Ce qui diffère réellement entre Firefox et Chrome/Edge :**

| | Firefox | Chrome/Edge |
|---|---|---|
| Background | `background.scripts` (event page, plusieurs fichiers, DOM disponible) | `background.service_worker` (un seul fichier, pas de DOM) |
| Namespace API | `browser.*` natif (promesses) | `chrome.*` (callbacks) — le [polyfill Mozilla](https://github.com/mozilla/webextension-polyfill) (`vendor/webextension-polyfill.js`, no-op sur Firefox) fournit `browser.*` partout |
| Icônes | SVG accepté | SVG **non supporté** (PNG obligatoire — `chromium/icons/*.png`, générées depuis `icons/icon.svg`) |
| Lecture audio en arrière-plan | `Audio` directement dans l'event page (+ keepalive, voir plus haut) | Le service worker n'a **aucun DOM** : passe par un [document offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen) (`chromium/offscreen.html`/`.js`, raison `AUDIO_PLAYBACK`, permission `offscreen`) piloté par messages |

**Chargement du service worker (`chromium/background-entry.js`)** :
Chrome n'accepte qu'un seul fichier pour `background.service_worker` —
contrairement au tableau `background.scripts` de Firefox. `importScripts()`
y recharge les mêmes fichiers `core/*.js`, dans le même ordre, dans le
même scope global (`self`) : c'est exactement pour cette raison que
chaque fichier `core/*.js` est enveloppé dans une IIFE (voir plus haut) —
la même précaution contre les collisions de `const`/fonctions s'applique
identiquement aux deux navigateurs. `background/background.js` lui-même
est chargé en dernier, inchangé : il n'appelle que `browser.*` (fourni
par le polyfill) et ne sait rien de la différence service worker / event
page.

**`core/notification.js` détecte l'environnement à l'exécution** :
`typeof Audio !== "undefined"` → lecture directe (Firefox) ;
sinon `chrome.offscreen` présent → document offscreen (Chrome/Edge). Le
document offscreen n'a pas besoin du "keepalive" : contrairement à une
event page Firefox, il n'est pas déchargé pour inactivité pendant la
lecture. `chrome.notifications` ne supportant pas le SVG, l'icône de
notification bascule aussi sur le PNG dans ce cas
(`notificationIconUrl()`).

**Build** : `node scripts/build-chromium.js` assemble `dist/chromium/`
(dossiers partagés + `chromium/`), chargeable tel quel via
"Charger l'extension non empaquetée". Script Node natif sans dépendance
(copie de fichiers seulement) — aucun bundler.

**Vérifié dans un vrai Edge** (via Chrome DevTools Protocol, service
worker + popup + options + document offscreen) pendant le développement :
service worker sans erreur, sélection de ville → horaires corrects dans
le popup, pipeline Adhan → document offscreen créé et messagerie
fonctionnelle. Un bug réel (chemin `chromium/offscreen.html` incorrect
après l'assemblage — le dossier `chromium/` est fusionné à la racine du
paquet, pas gardé comme sous-dossier) a été trouvé et corrigé grâce à
cette vérification, avant d'être commité.

## Limite connue

`audio/adhan.mp3` n'est pas fourni avec ce dépôt (voir `audio/README.md`) :
aucun enregistrement d'Adhan dont les droits de redistribution sont
certains n'a pu être vendoré. Le pipeline de lecture est néanmoins
entièrement implémenté et testé (voir `tests/scheduler.test.js`, test
"Adhan activé") avec un faux lecteur audio.
