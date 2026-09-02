/**
 * core/scheduler.js
 *
 * Source de vérité pour tout ce qui est planifié en arrière-plan :
 * alarmes de prière, mise à jour du badge. "Self-healing" : à chaque
 * appel de reconcile(), l'état est entièrement recalculé à partir de la
 * configuration courante et de l'heure réelle — aucune hypothèse n'est
 * faite sur la validité d'un état précédent (redémarrage, veille,
 * changement d'heure système, changement de jour ou de localisation :
 * un seul chemin de code gère tous ces cas).
 *
 * Le popup ne dépend pas de ce module : il recalcule son propre affichage
 * directement via core/prayer.js (voir popup/popup.js). Ce module est la
 * seule source de vérité pour les alarmes et le badge.
 *
 * Enveloppé dans une IIFE (voir core/timezone.js pour l'explication) afin
 * de ne rien fuiter dans le scope global partagé entre les scripts
 * classiques du background.
 */
(function () {

const SCHEDULER_STATE_KEY = "prayerReminderSchedulerState";
const BADGE_ALARM_NAME = "badge-tick";
const PRAYER_ALARM_PREFIX = "prayer:";

const isNode = typeof module !== "undefined" && !!module.exports;
/* eslint-disable global-require */
const tzModule = () => (isNode ? require("./timezone.js") : self.PRTimezone);
const prayerModule = () => (isNode ? require("./prayer.js") : self.PRPrayer);
const storageModule = () => (isNode ? require("./storage.js") : self.PRStorage);
const notificationModule = () => (isNode ? require("./notification.js") : self.PRNotification);
/* eslint-enable global-require */

async function getSchedulerState() {
  const result = await browser.storage.local.get(SCHEDULER_STATE_KEY);
  return result[SCHEDULER_STATE_KEY] || { lastFiredKey: null };
}

async function setSchedulerState(state) {
  await browser.storage.local.set({ [SCHEDULER_STATE_KEY]: state });
}

/** Calcule les horaires du jour et du lendemain à partir de la config. */
function computeDays(config, now) {
  const tz = tzModule();
  const prayer = prayerModule();
  const { latitude, longitude, timezone } = config.location;

  const todayRef = tz.todayReferenceDate(timezone, now);
  const tomorrowRef = tz.addDays(todayRef, 1, timezone);

  return {
    today: prayer.computeDay(latitude, longitude, todayRef, timezone),
    tomorrow: prayer.computeDay(latitude, longitude, tomorrowRef, timezone),
  };
}

async function clearPrayerAlarms() {
  const alarms = await browser.alarms.getAll();
  await Promise.all(
    alarms
      .filter((a) => a.name.startsWith(PRAYER_ALARM_PREFIX))
      .map((a) => browser.alarms.clear(a.name))
  );
}

async function clearBadge() {
  await browser.action.setBadgeText({ text: "" });
}

function formatBadge(minutesRemaining) {
  const m = Math.max(0, Math.round(minutesRemaining));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h${String(mm).padStart(2, "0")}`;
}

/**
 * Recalcule intégralement l'état (alarmes de prière + badge) à partir
 * de la configuration et de l'heure réelle actuelle. Supprime toute
 * ancienne alarme de prière avant d'en recréer, pour rester idempotent
 * et éviter les doublons quelle que soit la cause de l'appel
 * (démarrage, réveil, changement de jour, changement de localisation).
 */
async function reconcile() {
  const config = await storageModule().getConfig();

  await clearPrayerAlarms();

  if (!config.location) {
    await clearBadge();
    return;
  }

  const now = new Date();
  const { today, tomorrow } = computeDays(config, now);

  const prayer = prayerModule();
  const upcomingToday = prayer.PRAYER_ORDER.filter((key) => today[key].getTime() > now.getTime());

  if (upcomingToday.length > 0) {
    for (const key of upcomingToday) {
      await browser.alarms.create(`${PRAYER_ALARM_PREFIX}${today.dayKey}:${key}`, {
        when: today[key].getTime(),
      });
    }
  } else {
    await browser.alarms.create(`${PRAYER_ALARM_PREFIX}${tomorrow.dayKey}:fajr`, {
      when: tomorrow.fajr.getTime(),
    });
  }

  if (!(await browser.alarms.get(BADGE_ALARM_NAME))) {
    await browser.alarms.create(BADGE_ALARM_NAME, { periodInMinutes: 1 });
  }

  await updateBadge();
}

/**
 * Met à jour le badge à partir d'un recalcul frais (pas de cache).
 * Respecte la même fenêtre "en cours" (ONGOING_WINDOW_MINUTES) que le
 * popup : si une prière vient de sonner, le badge affiche le temps
 * restant de cette fenêtre plutôt que de sauter directement au compte à
 * rebours de la prière suivante.
 */
async function updateBadge() {
  const config = await storageModule().getConfig();
  if (!config.location) {
    await clearBadge();
    return;
  }

  const now = new Date();
  const { today, tomorrow } = computeDays(config, now);
  const prayer = prayerModule();
  const state = prayer.findDisplayState(today, tomorrow, now);

  if (!state) {
    await clearBadge();
    return;
  }

  const targetTime = state.mode === "ongoing" ? state.endsAt : state.time;
  const minutesRemaining = (targetTime.getTime() - now.getTime()) / 60000;
  await browser.action.setBadgeText({ text: formatBadge(minutesRemaining) });
}

/** Horaire réel d'une prière donnée, à partir de sa clé de jour ("YYYY-MM-DD"). */
function scheduledTimeForAlarm(dayKey, prayerKey, config) {
  const tz = tzModule();
  const prayer = prayerModule();
  const [year, month, day] = dayKey.split("-").map(Number);
  const referenceDate = tz.noonDateForDay(year, month, day);
  const { latitude, longitude, timezone } = config.location;
  const computedDay = prayer.computeDay(latitude, longitude, referenceDate, timezone);
  return computedDay[prayerKey];
}

/**
 * Traite le déclenchement d'une alarme de prière : revérifie l'heure
 * réelle et l'identité de la prière plutôt que de faire confiance
 * aveuglément au nom de l'alarme (protège contre une alarme en retard
 * après une veille prolongée ou un changement d'heure système), déclenche
 * les effets une seule fois par prière/jour, puis reprogramme la suite.
 *
 * Si le PC s'est réveillé longtemps après l'heure théorique de la
 * prière (plus de ONGOING_WINDOW_MINUTES de retard — typiquement après
 * une veille prolongée traversant plusieurs prières, où Firefox relivre
 * toutes les alarmes en retard d'un coup), la notification n'est PAS
 * affichée pour cette prière manquée : on ne notifie que pour une prière
 * encore "d'actualité". L'état est quand même marqué comme traité pour
 * ne jamais redéclencher, et reconcile() reprogramme normalement la
 * suite.
 */
async function handlePrayerAlarm(alarmName) {
  const [, dayKey, prayerKey] = alarmName.split(":");
  const key = `${dayKey}:${prayerKey}`;

  const state = await getSchedulerState();
  if (state.lastFiredKey === key) {
    return; // déjà déclenché, évite un doublon
  }

  const config = await storageModule().getConfig();
  if (config.location) {
    const scheduledTime = scheduledTimeForAlarm(dayKey, prayerKey, config);
    const lateMinutes = (Date.now() - scheduledTime.getTime()) / 60000;
    if (lateMinutes <= prayerModule().ONGOING_WINDOW_MINUTES) {
      await notificationModule().firePrayerEffects(prayerKey, dayKey, config);
    }
  }

  await setSchedulerState({ lastFiredKey: key });
  await reconcile();
}

async function handleAlarm(alarm) {
  if (alarm.name === BADGE_ALARM_NAME) {
    await updateBadge();
    return;
  }
  if (alarm.name.startsWith(PRAYER_ALARM_PREFIX)) {
    await handlePrayerAlarm(alarm.name);
  }
}

/** À appeler après un changement de localisation dans les paramètres. */
async function onLocationChanged() {
  await reconcile();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SCHEDULER_STATE_KEY,
    BADGE_ALARM_NAME,
    PRAYER_ALARM_PREFIX,
    computeDays,
    formatBadge,
    scheduledTimeForAlarm,
    reconcile,
    updateBadge,
    handleAlarm,
    handlePrayerAlarm,
    onLocationChanged,
  };
} else {
  self.PRScheduler = {
    reconcile,
    updateBadge,
    handleAlarm,
    onLocationChanged,
  };
}

})();
