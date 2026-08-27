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

## Couche d'adaptation (portabilité Chromium future)

`core/*.js` n'appelle que des API `browser.*` standard (alignées sur le
namespace WebExtensions promise-based). Aucun fichier `core/` ne
référence directement une particularité Firefox (event page vs service
worker) : cette différence est confinée à `manifest.json` et
`background/background.js`. Porter la logique métier vers Chromium ne
demanderait donc, en première approximation, que d'adapter le manifest
(service_worker) et d'ajouter un polyfill `browser` global si nécessaire.

## Limite connue

`audio/adhan.mp3` n'est pas fourni avec ce dépôt (voir `audio/README.md`) :
aucun enregistrement d'Adhan dont les droits de redistribution sont
certains n'a pu être vendoré. Le pipeline de lecture est néanmoins
entièrement implémenté et testé (voir `tests/scheduler.test.js`, test
"Adhan activé") avec un faux lecteur audio.
