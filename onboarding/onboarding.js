/**
 * onboarding/onboarding.js — assistant de premier lancement (3 écrans).
 */

const GEO_ERROR_MESSAGES = {
  PERMISSION_DENIED: "Permission de géolocalisation refusée. Choisissez une ville manuellement.",
  POSITION_UNAVAILABLE: "Position indisponible. Choisissez une ville manuellement.",
  TIMEOUT: "La géolocalisation a expiré. Choisissez une ville manuellement.",
  UNSUPPORTED: "Géolocalisation non disponible sur ce navigateur.",
  INVALID_COORDINATES: "Coordonnées invalides reçues.",
};

function showStep(n) {
  for (const i of [1, 2, 3]) {
    document.getElementById(`step-${i}`).classList.toggle("hidden", i !== n);
  }
}

async function saveLocationAndConfirm(location) {
  await PRStorage.setConfig({ location, onboardingComplete: true });
  document.getElementById("confirm-city").textContent = `✓ ${location.name}`;
  showStep(3);
}

async function init() {
  const config = await PRStorage.getConfig();
  self.PRTheme.applyTheme(config.theme);

  const { cities } = await PRLocation.loadCitiesData();
  const select = document.getElementById("city-select");
  for (const city of cities) {
    const option = document.createElement("option");
    option.value = city.id;
    option.textContent = city.name;
    select.appendChild(option);
  }

  document.getElementById("start-btn").addEventListener("click", () => showStep(2));

  document.getElementById("use-city-btn").addEventListener("click", async () => {
    const city = PRLocation.findCityById(cities, select.value);
    const location = PRLocation.buildLocationFromCity(city, PRTimezone.DEFAULT_TIMEZONE);
    await saveLocationAndConfirm(location);
  });

  document.getElementById("use-geo-btn").addEventListener("click", async () => {
    const errorEl = document.getElementById("location-error");
    errorEl.classList.add("hidden");
    try {
      const granted = await PRLocation.requestGeolocationPermission();
      if (!granted) {
        throw new PRLocation.GeolocationError(PRLocation.GEO_ERROR.PERMISSION_DENIED);
      }
      const { latitude, longitude } = await PRLocation.getCurrentPosition();
      const location = PRLocation.buildLocationFromCoordinates(latitude, longitude, PRTimezone.DEFAULT_TIMEZONE);
      await saveLocationAndConfirm(location);
    } catch (err) {
      errorEl.textContent = GEO_ERROR_MESSAGES[err.code] || "Localisation impossible.";
      errorEl.classList.remove("hidden");
    }
  });

  document.getElementById("finish-btn").addEventListener("click", async () => {
    await browser.runtime.sendMessage({ type: "location-changed" }).catch(() => {});
    window.close();
  });
}

init();
