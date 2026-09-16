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
 * Note technique (Chrome/Edge) : le service worker MV3 n'a aucun DOM —
 * ni `Audio`, ni `document` — donc `new Audio()` n'y existe pas. La
 * lecture y passe par un document "offscreen" (chromium/offscreen.js),
 * seul contexte MV3 avec un vrai DOM, piloté par messages. Cette
 * approche n'a pas besoin du "keepalive" ci-dessus : un document
 * offscreen n'est pas déchargé pour inactivité comme une event page.
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

/** true dans un service worker Chrome/Edge (MV3), false dans une event page Firefox. */
function isChromiumServiceWorker() {
  return typeof chrome !== "undefined" && !!chrome.offscreen && typeof chrome.runtime?.getContexts === "function";
}

/** true si `new Audio()` est directement utilisable dans ce contexte (event page Firefox). */
function isAudioAvailable() {
  return typeof Audio !== "undefined";
}

function notificationIconUrl() {
  // Chrome/Edge ne supporte pas le SVG pour les icônes de notification.
  return isChromiumServiceWorker() ? browser.runtime.getURL("icons/icon-128.png") : browser.runtime.getURL("icons/icon.svg");
}

async function showPrayerNotification(prayerKey, dayKey) {
  const label = PRAYER_LABELS[prayerKey] || prayerKey;
  await browser.notifications.create(`prayer-${dayKey}-${prayerKey}`, {
    type: "basic",
    iconUrl: notificationIconUrl(),
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
 * Joue l'Adhan directement (Firefox : `Audio` existe dans l'event page).
 * Résout une fois la lecture terminée (ou immédiatement en cas d'échec,
 * après avoir loggué l'erreur).
 */
function playAdhanDirect() {
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

/** Attend le message "adhan-ended" renvoyé par chromium/offscreen.js. */
function waitForAdhanEnded() {
  return new Promise((resolve) => {
    function handleMessage(message) {
      if (message && message.type === "adhan-ended") {
        chrome.runtime.onMessage.removeListener(handleMessage);
        resolve();
      }
    }
    chrome.runtime.onMessage.addListener(handleMessage);
  });
}

/**
 * Joue l'Adhan via un document offscreen (Chrome/Edge : le service
 * worker n'a pas de DOM). Crée le document offscreen s'il n'existe pas
 * déjà, lui envoie l'URL du fichier à jouer, puis attend sa confirmation
 * de fin de lecture.
 */
async function playAdhanViaOffscreen() {
  try {
    const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
    if (existing.length === 0) {
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL("offscreen.html"),
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Lecture de l'Adhan à l'heure de la prière",
      });
    }
  } catch (error) {
    console.error("Adhan Maroc: impossible de créer le document offscreen", error);
    return;
  }

  const ended = waitForAdhanEnded();
  chrome.runtime.sendMessage({ type: "play-adhan", url: browser.runtime.getURL("audio/adhan.mp3") }).catch(() => {});
  await ended;
}

/** Joue le fichier Adhan local, quel que soit le contexte disponible. */
function playAdhan() {
  if (isAudioAvailable()) {
    return playAdhanDirect();
  }
  if (isChromiumServiceWorker()) {
    return playAdhanViaOffscreen();
  }
  console.error("Adhan Maroc: aucune méthode de lecture audio disponible dans ce contexte");
  return Promise.resolve();
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
  module.exports = {
    PRAYER_LABELS,
    isChromiumServiceWorker,
    isAudioAvailable,
    notificationIconUrl,
    showPrayerNotification,
    playAdhanDirect,
    playAdhanViaOffscreen,
    playAdhan,
    firePrayerEffects,
  };
} else {
  self.PRNotification = { PRAYER_LABELS, showPrayerNotification, playAdhan, firePrayerEffects };
}

})();
