/**
 * core/storage.js
 *
 * Seul point d'accès à browser.storage.local. La structure stockée est
 * versionnée (`schemaVersion`) pour permettre des migrations futures sans
 * casser les installations existantes.
 *
 * Enveloppé dans une IIFE (voir core/timezone.js pour l'explication) afin
 * de ne rien fuiter dans le scope global partagé entre les scripts
 * classiques du background.
 */
(function () {

const STORAGE_KEY = "prayerReminderConfig";
const SCHEMA_VERSION = 1;

function defaultConfig() {
  return {
    schemaVersion: SCHEMA_VERSION,
    onboardingComplete: false,
    location: null, // { type: "city"|"geolocation", name, latitude, longitude, timezone }
    notifications: true,
    adhan: true,
    timeFormat: "24h", // "24h" | "12h"
    theme: "system", // "system" | "light" | "dark"
  };
}

/**
 * Fait migrer une config potentiellement ancienne/corrompue vers la
 * version courante. Toute valeur manquante ou de type invalide est
 * remplacée par sa valeur par défaut plutôt que de faire échouer
 * l'extension.
 */
function migrate(raw) {
  const defaults = defaultConfig();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }

  const config = { ...defaults, ...raw, schemaVersion: SCHEMA_VERSION };

  if (config.location && typeof config.location === "object") {
    const loc = config.location;
    const validLocation =
      typeof loc.latitude === "number" &&
      typeof loc.longitude === "number" &&
      Number.isFinite(loc.latitude) &&
      Number.isFinite(loc.longitude) &&
      Math.abs(loc.latitude) <= 90 &&
      Math.abs(loc.longitude) <= 180 &&
      typeof loc.timezone === "string" &&
      loc.timezone.length > 0;
    config.location = validLocation ? loc : null;
  } else {
    config.location = null;
  }

  if (typeof config.notifications !== "boolean") config.notifications = defaults.notifications;
  if (typeof config.adhan !== "boolean") config.adhan = defaults.adhan;
  if (!["24h", "12h"].includes(config.timeFormat)) config.timeFormat = defaults.timeFormat;
  if (!["system", "light", "dark"].includes(config.theme)) config.theme = defaults.theme;
  if (typeof config.onboardingComplete !== "boolean") {
    config.onboardingComplete = defaults.onboardingComplete;
  }

  return config;
}

async function getConfig() {
  const result = await browser.storage.local.get(STORAGE_KEY);
  return migrate(result[STORAGE_KEY]);
}

async function setConfig(partial) {
  const current = await getConfig();
  const next = migrate({ ...current, ...partial });
  await browser.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

function onConfigChanged(callback) {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[STORAGE_KEY]) return;
    callback(migrate(changes[STORAGE_KEY].newValue));
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { STORAGE_KEY, SCHEMA_VERSION, defaultConfig, migrate, getConfig, setConfig, onConfigChanged };
} else {
  self.PRStorage = { STORAGE_KEY, SCHEMA_VERSION, defaultConfig, migrate, getConfig, setConfig, onConfigChanged };
}

})();
