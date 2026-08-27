/**
 * core/timezone.js
 *
 * Toute l'extension passe par ce module pour manipuler des dates/heures
 * liées à un fuseau horaire. Aucun autre module ne doit calculer un offset
 * UTC "à la main" : le Maroc a basculé plusieurs fois entre UTC+0 et UTC+1
 * (dérogation pendant une partie du Ramadan), et cette règle est décidée
 * par décret, pas par une formule fixe. En s'appuyant uniquement sur
 * l'API Intl avec l'identifiant IANA "Africa/Casablanca", l'extension
 * hérite automatiquement des mises à jour de la base tzdata livrée avec
 * Firefox, sans code à maintenir ici.
 *
 * Enveloppé dans une IIFE : dans le background Firefox, tous les fichiers
 * core/*.js sont chargés comme des scripts classiques qui partagent le
 * même scope global (pas de modules ES) — sans cette IIFE, un `const`
 * ou une fonction du même nom dans un autre fichier provoquerait une
 * SyntaxError de redéclaration au chargement de l'extension.
 */
(function () {

const DEFAULT_TIMEZONE = "Africa/Casablanca";

/**
 * Retourne les composants calendaires (année/mois/jour) d'une Date,
 * tels qu'ils seraient lus par une horloge murale dans le fuseau donné.
 */
function getWallClockParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: map.hour === "24" ? 0 : Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/**
 * Clé de jour stable ("YYYY-MM-DD") dans le fuseau donné, indépendante
 * de l'heure système du PC de l'utilisateur.
 */
function dayKey(date, timeZone = DEFAULT_TIMEZONE) {
  const { year, month, day } = getWallClockParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Construit un objet Date représentant midi UTC pour un jour calendaire
 * donné dans le fuseau cible. Midi (et non minuit) est utilisé comme
 * point de référence pour le calcul astronomique du jour, afin d'éviter
 * toute ambiguïté de bord de journée liée au fuseau.
 */
function noonDateForDay(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

/** Date représentant "aujourd'hui" (jour calendaire) dans le fuseau cible. */
function todayReferenceDate(timeZone = DEFAULT_TIMEZONE, now = new Date()) {
  const { year, month, day } = getWallClockParts(now, timeZone);
  return noonDateForDay(year, month, day);
}

/** Ajoute `n` jours calendaires (dans le fuseau cible) à une date de référence. */
function addDays(referenceDate, n, timeZone = DEFAULT_TIMEZONE) {
  const { year, month, day } = getWallClockParts(referenceDate, timeZone);
  const shifted = new Date(Date.UTC(year, month - 1, day + n, 12, 0, 0));
  const parts = getWallClockParts(shifted, "UTC");
  return noonDateForDay(parts.year, parts.month, parts.day);
}

/**
 * Formate une Date en heure locale (fuseau cible) au format demandé.
 */
function formatTime(date, { timeZone = DEFAULT_TIMEZONE, hour12 = false } = {}) {
  // Locale "en-US" en mode 12h pour un rendu AM/PM prévisible ; "fr-FR"
  // en mode 24h pour un rendu "05:26" cohérent avec le reste de l'UI.
  const formatter = new Intl.DateTimeFormat(hour12 ? "en-US" : "fr-FR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12,
  });
  let formatted = formatter.format(date);
  // Certaines implémentations ICU affichent "24:XX" au lieu de "00:XX"
  // (resp. "24:XX AM" au lieu de "12:XX AM") à minuit ; on normalise par
  // sécurité, même si aucun horaire de prière au Maroc ne tombe près de
  // minuit en pratique.
  formatted = formatted.replace(/^24:/, hour12 ? "12:" : "00:");
  return formatted;
}

/** Millisecondes d'une Date arrondies à la minute la plus proche (>=30s monte). */
function roundToNearestMinute(date) {
  const ms = date.getTime();
  const rounded = Math.round(ms / 60000) * 60000;
  return new Date(rounded);
}

/** true si `date` (arrondie) est strictement dans le passé par rapport à `now`. */
function isBefore(date, now) {
  return date.getTime() <= now.getTime();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEFAULT_TIMEZONE,
    getWallClockParts,
    dayKey,
    noonDateForDay,
    todayReferenceDate,
    addDays,
    formatTime,
    roundToNearestMinute,
    isBefore,
  };
} else {
  self.PRTimezone = {
    DEFAULT_TIMEZONE,
    getWallClockParts,
    dayKey,
    noonDateForDay,
    todayReferenceDate,
    addDays,
    formatTime,
    roundToNearestMinute,
    isBefore,
  };
}

})();
