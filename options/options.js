/**
 * options/options.js
 */

const GEO_ERROR_MESSAGES = {
  PERMISSION_DENIED: "Permission de géolocalisation refusée. Sélectionnez une ville manuellement.",
  POSITION_UNAVAILABLE: "Position indisponible. Sélectionnez une ville manuellement.",
  TIMEOUT: "La géolocalisation a expiré. Sélectionnez une ville manuellement.",
  UNSUPPORTED: "Géolocalisation non disponible sur ce navigateur.",
  INVALID_COORDINATES: "Coordonnées invalides reçues.",
};

async function notifyLocationChanged() {
  await browser.runtime.sendMessage({ type: "location-changed" }).catch(() => {});
}

function renderLocationCurrent(config) {
  const el = document.getElementById("location-current");
  el.textContent = config.location ? `${config.location.name}, Maroc` : "Non configurée";
}

async function populateCitySelect() {
  const { cities } = await PRLocation.loadCitiesData();
  const select = document.getElementById("city-select");
  select.innerHTML = "";
  for (const city of cities) {
    const option = document.createElement("option");
    option.value = city.id;
    option.textContent = city.name;
    select.appendChild(option);
  }
  return cities;
}

async function init() {
  let config = await PRStorage.getConfig();
  self.PRTheme.applyTheme(config.theme);

  renderLocationCurrent(config);
  const cities = await populateCitySelect();

  document.getElementById("edit-location-btn").addEventListener("click", () => {
    document.getElementById("location-editor").classList.toggle("hidden");
  });

  document.getElementById("use-city-btn").addEventListener("click", async () => {
    const errorEl = document.getElementById("location-error");
    errorEl.classList.add("hidden");
    try {
      const cityId = document.getElementById("city-select").value;
      const city = PRLocation.findCityById(cities, cityId);
      const location = PRLocation.buildLocationFromCity(city, PRTimezone.DEFAULT_TIMEZONE);
      config = await PRStorage.setConfig({ location, onboardingComplete: true });
      renderLocationCurrent(config);
      document.getElementById("location-editor").classList.add("hidden");
      await notifyLocationChanged();
    } catch (err) {
      errorEl.textContent = err.message || "Ville invalide.";
      errorEl.classList.remove("hidden");
    }
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
      config = await PRStorage.setConfig({ location, onboardingComplete: true });
      renderLocationCurrent(config);
      document.getElementById("location-editor").classList.add("hidden");
      await notifyLocationChanged();
    } catch (err) {
      errorEl.textContent = GEO_ERROR_MESSAGES[err.code] || "Localisation impossible.";
      errorEl.classList.remove("hidden");
    }
  });

  const notifToggle = document.getElementById("notifications-toggle");
  notifToggle.checked = config.notifications;
  notifToggle.addEventListener("change", async () => {
    config = await PRStorage.setConfig({ notifications: notifToggle.checked });
  });

  const adhanToggle = document.getElementById("adhan-toggle");
  adhanToggle.checked = config.adhan;
  adhanToggle.addEventListener("change", async () => {
    config = await PRStorage.setConfig({ adhan: adhanToggle.checked });
  });

  for (const radio of document.querySelectorAll('input[name="time-format"]')) {
    radio.checked = radio.value === config.timeFormat;
    radio.addEventListener("change", async () => {
      config = await PRStorage.setConfig({ timeFormat: radio.value });
    });
  }

  for (const radio of document.querySelectorAll('input[name="theme"]')) {
    radio.checked = radio.value === config.theme;
    radio.addEventListener("change", async () => {
      config = await PRStorage.setConfig({ theme: radio.value });
      self.PRTheme.applyTheme(config.theme);
    });
  }

  document.getElementById("version-line").textContent = `Version ${browser.runtime.getManifest().version}`;
}

init();
