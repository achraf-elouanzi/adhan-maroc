/**
 * popup/popup.js
 *
 * Calcule et affiche l'état du jour directement à partir de core/prayer.js
 * (le popup ne dépend pas de core/scheduler.js — voir la note en tête de
 * ce fichier). Un setInterval local anime le compte à rebours seconde par
 * seconde tant que le popup est ouvert ; il est automatiquement détruit à
 * la fermeture du popup, sans aucun timer d'arrière-plan.
 */

const PRAYER_LABELS = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };

let countdownTimerId = null;

function formatCountdown(msRemaining) {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `dans ${h}:${pad(m)}:${pad(s)}` : `dans ${m}:${pad(s)}`;
}

function formatDateLine(now, timezone) {
  const formatter = new Intl.DateTimeFormat("fr-FR", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "long",
  });
  const text = formatter.format(now);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function renderPrayerList(today, currentKey, nextKey, hour12) {
  const list = document.getElementById("prayer-list");
  list.innerHTML = "";

  for (const key of PRPrayer.PRAYER_ORDER) {
    const li = document.createElement("li");
    const isPassed = currentKey && PRPrayer.PRAYER_ORDER.indexOf(key) <= PRPrayer.PRAYER_ORDER.indexOf(currentKey) && key !== nextKey;
    const isNext = key === nextKey;

    if (isPassed) li.classList.add("passed");
    if (isNext) li.classList.add("next");

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = PRAYER_LABELS[key];

    const time = document.createElement("span");
    time.className = "time";
    const mark = document.createElement("span");
    mark.className = "mark";
    mark.textContent = isPassed ? "✓" : isNext ? "●" : "";
    const timeText = document.createElement("span");
    timeText.textContent = PRTimezone.formatTime(today[key], { timeZone: today.timezone, hour12 });
    time.append(timeText, mark);

    li.append(name, time);
    list.appendChild(li);
  }
}

async function render() {
  const config = await PRStorage.getConfig();
  self.PRTheme.applyTheme(config.theme);

  const setupView = document.getElementById("setup-view");
  const mainView = document.getElementById("main-view");

  if (!config.location) {
    setupView.classList.remove("hidden");
    mainView.classList.add("hidden");
    document.getElementById("setup-button").addEventListener("click", () => {
      browser.tabs.create({ url: browser.runtime.getURL("onboarding/onboarding.html") });
      window.close();
    });
    return;
  }

  setupView.classList.add("hidden");
  mainView.classList.remove("hidden");

  const { latitude, longitude, timezone, name } = config.location;
  document.getElementById("location-name").textContent = name;

  const hour12 = config.timeFormat === "12h";
  const notifToggle = document.getElementById("notif-toggle");
  notifToggle.classList.toggle("off", !config.notifications);
  notifToggle.addEventListener("click", async () => {
    const updated = await PRStorage.setConfig({ notifications: !config.notifications });
    notifToggle.classList.toggle("off", !updated.notifications);
    config.notifications = updated.notifications;
  });

  document.getElementById("options-btn").addEventListener("click", () => {
    browser.runtime.openOptionsPage();
  });

  function tick() {
    const now = new Date();
    const todayRef = PRTimezone.todayReferenceDate(timezone, now);
    const today = { ...PRPrayer.computeDay(latitude, longitude, todayRef, timezone), timezone };
    const tomorrowRef = PRTimezone.addDays(todayRef, 1, timezone);
    const tomorrow = { ...PRPrayer.computeDay(latitude, longitude, tomorrowRef, timezone), timezone };

    document.getElementById("date-line").textContent = formatDateLine(now, timezone);

    const next = PRPrayer.findNextPrayer(today, tomorrow, now);
    const current = PRPrayer.findCurrentPrayer(today, now);

    if (next) {
      const label = next.isTomorrow ? `${PRAYER_LABELS[next.key]} demain` : PRAYER_LABELS[next.key];
      document.getElementById("next-name").textContent = label;
      document.getElementById("next-time").textContent = PRTimezone.formatTime(next.time, { timeZone: timezone, hour12 });
      document.getElementById("next-countdown").textContent = formatCountdown(next.time.getTime() - now.getTime());
    }

    renderPrayerList(today, current, next && !next.isTomorrow ? next.key : null, hour12);
  }

  tick();
  countdownTimerId = setInterval(tick, 1000);
}

window.addEventListener("unload", () => {
  if (countdownTimerId) clearInterval(countdownTimerId);
});

render();
