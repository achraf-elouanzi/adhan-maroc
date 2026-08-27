/**
 * core/location.js
 *
 * Gère les deux sources de localisation : ville marocaine (base locale
 * embarquée) ou géolocalisation navigateur. Aucune requête réseau,
 * aucun géocodage distant. Les coordonnées ne quittent jamais l'appareil.
 *
 * Enveloppé dans une IIFE (voir core/timezone.js pour l'explication) afin
 * de ne rien fuiter dans le scope global partagé entre les scripts
 * classiques du background.
 */
(function () {

const isNode = typeof module !== "undefined" && !!module.exports;

const GEO_ERROR = {
  PERMISSION_DENIED: "PERMISSION_DENIED",
  POSITION_UNAVAILABLE: "POSITION_UNAVAILABLE",
  TIMEOUT: "TIMEOUT",
  UNSUPPORTED: "UNSUPPORTED",
  INVALID_COORDINATES: "INVALID_COORDINATES",
};

class GeolocationError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "GeolocationError";
    this.code = code;
  }
}

async function loadCitiesData() {
  if (isNode) {
    // eslint-disable-next-line global-require
    return require("../data/cities-ma.json");
  }
  const url = browser.runtime.getURL("data/cities-ma.json");
  const response = await fetch(url);
  return response.json();
}

function isValidCoordinates(latitude, longitude) {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

function findCityById(cities, id) {
  return cities.find((c) => c.id === id) || null;
}

function buildLocationFromCity(city, timezone) {
  if (!city || !isValidCoordinates(city.latitude, city.longitude)) {
    throw new GeolocationError(GEO_ERROR.INVALID_COORDINATES, "Ville invalide");
  }
  return {
    type: "city",
    cityId: city.id,
    name: city.name,
    latitude: city.latitude,
    longitude: city.longitude,
    timezone,
  };
}

function buildLocationFromCoordinates(latitude, longitude, timezone) {
  if (!isValidCoordinates(latitude, longitude)) {
    throw new GeolocationError(GEO_ERROR.INVALID_COORDINATES, "Coordonnées invalides");
  }
  return {
    type: "geolocation",
    name: "Ma position",
    latitude,
    longitude,
    timezone,
  };
}

/**
 * Demande la permission runtime "geolocation" (optional_permissions).
 * Doit être appelé depuis un contexte avec geste utilisateur (clic).
 */
async function requestGeolocationPermission() {
  if (isNode) return true;
  return browser.permissions.request({ permissions: ["geolocation"] });
}

/**
 * Résout la position actuelle via navigator.geolocation, avec une
 * gestion explicite de chaque cas d'erreur attendu par le cahier des
 * charges : permission refusée, position indisponible, timeout.
 */
function getCurrentPosition({ timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new GeolocationError(GEO_ERROR.UNSUPPORTED, "Géolocalisation non disponible"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        if (!isValidCoordinates(latitude, longitude)) {
          reject(new GeolocationError(GEO_ERROR.INVALID_COORDINATES, "Coordonnées invalides"));
          return;
        }
        resolve({ latitude, longitude });
      },
      (error) => {
        // GeolocationPositionError.code : 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
        const codeMap = {
          1: GEO_ERROR.PERMISSION_DENIED,
          2: GEO_ERROR.POSITION_UNAVAILABLE,
          3: GEO_ERROR.TIMEOUT,
        };
        reject(new GeolocationError(codeMap[error.code] || GEO_ERROR.POSITION_UNAVAILABLE, error.message));
      },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GEO_ERROR,
    GeolocationError,
    loadCitiesData,
    isValidCoordinates,
    findCityById,
    buildLocationFromCity,
    buildLocationFromCoordinates,
    requestGeolocationPermission,
    getCurrentPosition,
  };
} else {
  self.PRLocation = {
    GEO_ERROR,
    GeolocationError,
    loadCitiesData,
    isValidCoordinates,
    findCityById,
    buildLocationFromCity,
    buildLocationFromCoordinates,
    requestGeolocationPermission,
    getCurrentPosition,
  };
}

})();
