/**
 * chromium/background-entry.js
 *
 * Point d'entrée du service worker MV3 (Chrome/Edge). Contrairement à
 * Firefox, Chrome n'accepte qu'un seul fichier pour `background.service_worker`
 * — `importScripts()` recrée ici le même chargement multi-fichiers que le
 * tableau `background.scripts` de Firefox, dans le même ordre, et partage
 * le même scope global (`self`) : c'est pour ça que chaque fichier
 * `core/*.js` est enveloppé dans une IIFE (voir core/timezone.js).
 *
 * `background/background.js` (partagé avec Firefox) est chargé en
 * dernier : il ne contient que des appels à `browser.*` (fournis ici par
 * le polyfill Mozilla) et ne sait rien de la différence service worker /
 * event page.
 */
/**
 * Chemins relatifs à la racine du paquet assemblé par
 * scripts/build-chromium.js (dist/chromium/), où ce fichier se retrouve
 * lui-même à la racine, au même niveau que vendor/, core/ et
 * background/ — PAS relatifs à chromium/ dans l'arborescence source.
 */
importScripts(
  "vendor/webextension-polyfill.js",
  "vendor/adhan.umd.min.js",
  "core/timezone.js",
  "core/storage.js",
  "core/prayer.js",
  "core/location.js",
  "core/scheduler.js",
  "core/notification.js",
  "background/background.js"
);
