/**
 * core/notification.js
 *
 * Mécanique d'affichage de la notification système et de lecture de
 * l'Adhan. Ne contient aucune logique de planification (voir
 * core/scheduler.js) : ce module se contente d'exécuter, une fois, les
 * effets de bord pour une prière donnée.
 *
 * Note technique (Firefox) : un background script MV3 (event page) peut
 * lire de l'audio sans geste utilisateur (pref
 * media.autoplay.allow-extension-backgroundscripts, activée par défaut
 * depuis Firefox 63). Le risque réel est que Firefox décharge l'event
 * page pour inactivité *pendant* la lecture (l'Adhan dure 1 à 4 minutes).
 * Le "keepalive" ci-dessous force un appel régulier à une API
 * browser.*, ce qui réinitialise le minuteur d'inactivité, jusqu'à la
 * fin de la lecture. Voir docs/architecture.md pour le détail et la
 * procédure de test réelle (popup fermé).
 *
 * Enveloppé dans une IIFE (voir core/timezone.js pour l'explication) afin
 * de ne rien fuiter dans le scope global partagé entre les scripts
 * classiques du background.
 */
(function () {

const PRAYER_LABELS = {
  fajr: "Fajr",
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
};

const KEEPALIVE_INTERVAL_MS = 20000;
const KEEPALIVE_MAX_DURATION_MS = 6 * 60 * 1000; // garde-fou si 'ended' ne se déclenche jamais

async function showPrayerNotification(prayerKey, dayKey) {
  const label = PRAYER_LABELS[prayerKey] || prayerKey;
  await browser.notifications.create(`prayer-${dayKey}-${prayerKey}`, {
    type: "basic",
    iconUrl: browser.runtime.getURL("icons/icon.svg"),
    title: `🕌 ${label}`,
    message: `Il est l'heure de la prière de ${label}.`,
  });
}

function startKeepalive() {
  const intervalId = setInterval(() => {
    // Un simple appel à une API browser.* suffit à signaler de l'activité
    // à l'event page et à repousser son déchargement pour inactivité.
    browser.storage.local.get("__keepalive").catch(() => {});
  }, KEEPALIVE_INTERVAL_MS);

  const timeoutId = setTimeout(() => clearInterval(intervalId), KEEPALIVE_MAX_DURATION_MS);

  return () => {
    clearInterval(intervalId);
    clearTimeout(timeoutId);
  };
}

/**
 * Joue le fichier Adhan local. Résout une fois la lecture terminée (ou
 * immédiatement en cas d'échec de lecture, après avoir loggué l'erreur).
 */
function playAdhan() {
  return new Promise((resolve) => {
    const audio = new Audio(browser.runtime.getURL("audio/adhan.mp3"));
    const stopKeepalive = startKeepalive();

    const finish = () => {
      stopKeepalive();
      resolve();
    };

    audio.addEventListener("ended", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });

    audio.play().catch((error) => {
      console.error("Adhan Maroc: lecture Adhan impossible", error);
      finish();
    });
  });
}

/**
 * Exécute les effets d'une prière (notification + Adhan optionnel),
 * selon la configuration utilisateur.
 */
async function firePrayerEffects(prayerKey, dayKey, config) {
  if (config.notifications) {
    await showPrayerNotification(prayerKey, dayKey);
  }
  if (config.adhan) {
    await playAdhan();
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { PRAYER_LABELS, showPrayerNotification, playAdhan, firePrayerEffects };
} else {
  self.PRNotification = { PRAYER_LABELS, showPrayerNotification, playAdhan, firePrayerEffects };
}

})();
