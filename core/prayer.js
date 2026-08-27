/**
 * core/prayer.js
 *
 * Façade au-dessus d'Adhan JS. Aucun autre module de l'extension ne doit
 * importer/référencer `adhan` (le global UMD) directement : si la
 * bibliothèque est un jour remplacée, seul ce fichier doit changer.
 *
 * Paramètres de calcul (cible Maroc / école malikite) :
 *   - Fajr  : 19° de dépression solaire, sans correction
 *   - Isha  : 17° de dépression solaire, sans correction
 *   - Asr   : shadow factor = 1 (Madhab.Shafi dans Adhan JS), sans correction
 *   - Dhuhr : midi solaire + 5 min (marge de précaution "ihtiyat")
 *   - Maghrib : coucher du soleil + 5 min (marge de précaution "ihtiyat")
 * Les corrections Dhuhr/Maghrib sont sourcées (comparaison aux horaires
 * officiels du Ministère des Habous, 8 villes, 2 saisons) — voir
 * docs/calculation.md pour le détail des mesures et des sources.
 *
 * Enveloppé dans une IIFE (voir core/timezone.js pour l'explication) afin
 * de ne rien fuiter dans le scope global partagé entre les scripts
 * classiques du background.
 */
(function () {

const FAJR_ANGLE = 19;
const ISHA_ANGLE = 17;

// Marge de précaution ("ihtiyat") de 5 minutes sur Dhuhr et Maghrib,
// confirmée par comparaison aux horaires officiels du Ministère des
// Habous (habous.gov.ma/prieres/index.php) sur 8 villes et 2 saisons
// (été 2026 et solstice d'hiver 2024, via archive.org) : l'écart est
// resté identique (+5 min) dans tous les cas, indépendamment de la
// position du soleil — donc une marge fixe, pas un artefact saisonnier
// ou géographique. Fajr, Asr et Isha n'ont montré aucun écart
// significatif et ne reçoivent donc aucune correction. Voir
// docs/calculation.md pour le détail des mesures et les sources.
const DHUHR_ADJUSTMENT_MINUTES = 5;
const MAGHRIB_ADJUSTMENT_MINUTES = 5;

const PRAYER_ORDER = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

const isNode = typeof module !== "undefined" && !!module.exports;

function getAdhan() {
  if (isNode) {
    // eslint-disable-next-line global-require
    return require("../vendor/adhan.umd.min.js");
  }
  return self.adhan;
}

function getTimezoneModule() {
  if (isNode) {
    // eslint-disable-next-line global-require
    return require("./timezone.js");
  }
  return self.PRTimezone;
}

function buildCalculationParameters(adhan) {
  const params = new adhan.CalculationParameters(null, FAJR_ANGLE, ISHA_ANGLE, 0, 0);
  params.madhab = adhan.Madhab.Shafi; // shadow factor = 1
  params.rounding = adhan.Rounding.None; // arrondi géré par core/timezone.js, pas par la lib
  params.adjustments.dhuhr = DHUHR_ADJUSTMENT_MINUTES;
  params.adjustments.maghrib = MAGHRIB_ADJUSTMENT_MINUTES;
  return params;
}

/**
 * Calcule les horaires bruts (non arrondis) pour un jour donné.
 * `referenceDate` doit être une Date représentant midi UTC du jour
 * calendaire visé (voir core/timezone.js#todayReferenceDate/addDays).
 */
function computeRawDay(latitude, longitude, referenceDate) {
  const adhan = getAdhan();
  const coordinates = new adhan.Coordinates(latitude, longitude);
  const params = buildCalculationParameters(adhan);
  const times = new adhan.PrayerTimes(coordinates, referenceDate, params);

  return {
    fajr: times.fajr,
    sunrise: times.sunrise,
    dhuhr: times.dhuhr,
    asr: times.asr,
    maghrib: times.maghrib,
    isha: times.isha,
  };
}

/**
 * Calcule les horaires du jour, arrondis à la minute (règle unique
 * utilisée pour l'affichage, les notifications et les tests).
 */
function computeDay(latitude, longitude, referenceDate, timezone) {
  const tz = getTimezoneModule();
  const raw = computeRawDay(latitude, longitude, referenceDate);

  const rounded = {};
  for (const key of Object.keys(raw)) {
    rounded[key] = tz.roundToNearestMinute(raw[key]);
  }

  return {
    dayKey: tz.dayKey(referenceDate, timezone),
    fajr: rounded.fajr,
    sunrise: rounded.sunrise,
    dhuhr: rounded.dhuhr,
    asr: rounded.asr,
    maghrib: rounded.maghrib,
    isha: rounded.isha,
  };
}

/**
 * Détermine la prochaine prière à partir d'un `PrayerDay` (aujourd'hui)
 * et, si toutes les prières du jour sont passées, du `PrayerDay` du
 * lendemain (nécessaire pour "Fajr demain").
 *
 * Retourne { key, time, isTomorrow } ou null si les deux jours fournis
 * ne contiennent aucune prière future (ne devrait pas arriver en usage
 * normal).
 */
function findNextPrayer(todayPrayerDay, tomorrowPrayerDay, now) {
  for (const key of PRAYER_ORDER) {
    const time = todayPrayerDay[key];
    if (time.getTime() > now.getTime()) {
      return { key, time, isTomorrow: false };
    }
  }

  if (tomorrowPrayerDay) {
    const key = PRAYER_ORDER[0];
    return { key, time: tomorrowPrayerDay[key], isTomorrow: true };
  }

  return null;
}

/**
 * Retourne la clé de la prière "courante" (dernière prière passée du
 * jour), ou null si Fajr n'est pas encore passé.
 */
function findCurrentPrayer(todayPrayerDay, now) {
  let current = null;
  for (const key of PRAYER_ORDER) {
    if (todayPrayerDay[key].getTime() <= now.getTime()) {
      current = key;
    }
  }
  return current;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FAJR_ANGLE,
    ISHA_ANGLE,
    PRAYER_ORDER,
    computeRawDay,
    computeDay,
    findNextPrayer,
    findCurrentPrayer,
  };
} else {
  self.PRPrayer = {
    FAJR_ANGLE,
    ISHA_ANGLE,
    PRAYER_ORDER,
    computeRawDay,
    computeDay,
    findNextPrayer,
    findCurrentPrayer,
  };
}

})();
