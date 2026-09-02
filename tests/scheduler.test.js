const test = require("node:test");
const assert = require("node:assert/strict");

const { createBrowserMock } = require("./helpers/browserMock.js");
const { withFixedNow } = require("./helpers/fakeClock.js");
const tz = require("../core/timezone.js");
const prayerCore = require("../core/prayer.js");
const cities = require("../data/cities-ma.json");

const CASABLANCA = cities.cities.find((c) => c.id === "casablanca");
const TIMEZONE = "Africa/Casablanca";
const JUNE_21 = tz.noonDateForDay(2026, 6, 21);

// Un fichier de test = un `require` frais de scheduler/storage/notification
// n'est pas possible (cache CommonJS), donc chaque test réassigne
// `global.browser` à un mock isolé plutôt que de recharger les modules.
const scheduler = require("../core/scheduler.js");
const storage = require("../core/storage.js");

function freshBrowser() {
  const mock = createBrowserMock();
  global.browser = mock;
  return mock;
}

test("formatBadge : formats attendus", () => {
  assert.equal(scheduler.formatBadge(0), "0m");
  assert.equal(scheduler.formatBadge(42), "42m");
  assert.equal(scheduler.formatBadge(75), "1h15");
  assert.equal(scheduler.formatBadge(125), "2h05");
});

test("reconcile() sans localisation : aucune alarme, badge vide", async () => {
  const mock = freshBrowser();
  await scheduler.reconcile();

  assert.equal(mock._debug.alarms.size, 0);
  assert.equal(mock._debug.getBadgeText(), "");
});

test("reconcile() avec localisation : programme les prières restantes du jour + le badge", async () => {
  const mock = freshBrowser();
  await storage.setConfig({
    location: { type: "city", cityId: "casablanca", name: "Casablanca", latitude: CASABLANCA.latitude, longitude: CASABLANCA.longitude, timezone: TIMEZONE },
  });

  const today = prayerCore.computeDay(CASABLANCA.latitude, CASABLANCA.longitude, JUNE_21, TIMEZONE);
  const fixedNow = today.fajr.getTime() - 60 * 60 * 1000; // 1h avant Fajr : les 5 prières restent à venir

  await withFixedNow(fixedNow, async () => {
    await scheduler.reconcile();
  });

  const alarmNames = Array.from(mock._debug.alarms.keys());
  for (const key of prayerCore.PRAYER_ORDER) {
    assert.ok(alarmNames.includes(`prayer:${today.dayKey}:${key}`), `alarme manquante pour ${key}`);
  }
  assert.ok(alarmNames.includes("badge-tick"));
  assert.match(mock._debug.getBadgeText(), /^\d+(m|h\d{2})$/);
});

test("reconcile() après Isha : programme uniquement Fajr du lendemain (fin/début de journée)", async () => {
  const mock = freshBrowser();
  await storage.setConfig({
    location: { type: "city", cityId: "casablanca", name: "Casablanca", latitude: CASABLANCA.latitude, longitude: CASABLANCA.longitude, timezone: TIMEZONE },
  });

  const today = prayerCore.computeDay(CASABLANCA.latitude, CASABLANCA.longitude, JUNE_21, TIMEZONE);
  const tomorrowRef = tz.addDays(JUNE_21, 1, TIMEZONE);
  const tomorrow = prayerCore.computeDay(CASABLANCA.latitude, CASABLANCA.longitude, tomorrowRef, TIMEZONE);
  const fixedNow = today.isha.getTime() + 60 * 60 * 1000; // 1h après Isha

  await withFixedNow(fixedNow, async () => {
    await scheduler.reconcile();
  });

  const alarmNames = Array.from(mock._debug.alarms.keys()).filter((n) => n.startsWith("prayer:"));
  assert.deepEqual(alarmNames, [`prayer:${tomorrow.dayKey}:fajr`]);
});

test("reconcile() supprime les anciennes alarmes avant d'en recréer (changement de localisation)", async () => {
  const mock = freshBrowser();
  await storage.setConfig({
    location: { type: "city", cityId: "casablanca", name: "Casablanca", latitude: CASABLANCA.latitude, longitude: CASABLANCA.longitude, timezone: TIMEZONE },
  });

  const today = prayerCore.computeDay(CASABLANCA.latitude, CASABLANCA.longitude, JUNE_21, TIMEZONE);
  const fixedNow = today.fajr.getTime() - 60 * 60 * 1000;

  await withFixedNow(fixedNow, () => scheduler.reconcile());
  const firstRunCount = mock._debug.alarms.size;
  assert.ok(firstRunCount > 0);

  // Changement de ville -> nouvelles coordonnées, reconcile doit repartir propre.
  await storage.setConfig({
    location: { type: "city", cityId: "rabat", name: "Rabat", latitude: 34.0209, longitude: -6.8416, timezone: TIMEZONE },
  });
  await withFixedNow(fixedNow, () => scheduler.onLocationChanged());

  const prayerAlarms = Array.from(mock._debug.alarms.keys()).filter((n) => n.startsWith("prayer:"));
  assert.equal(prayerAlarms.length, prayerCore.PRAYER_ORDER.length, "pas de doublons après un changement de ville");
});

test("updateBadge() : pendant la fenêtre \"en cours\", affiche le temps restant de cette fenêtre (pas celui de la prochaine prière)", async () => {
  const mock = freshBrowser();
  await storage.setConfig({
    location: { type: "city", cityId: "casablanca", name: "Casablanca", latitude: CASABLANCA.latitude, longitude: CASABLANCA.longitude, timezone: TIMEZONE },
  });

  const today = prayerCore.computeDay(CASABLANCA.latitude, CASABLANCA.longitude, JUNE_21, TIMEZONE);
  const fixedNow = today.dhuhr.getTime() + 3 * 60 * 1000; // 3 min après Dhuhr, encore "en cours" (fenêtre de 15 min)

  await withFixedNow(fixedNow, () => scheduler.updateBadge());

  assert.equal(mock._debug.getBadgeText(), "12m", "doit refléter le temps restant de la fenêtre \"en cours\", pas le temps jusqu'à Asr");
});

test("handlePrayerAlarm : déclenche les effets une seule fois par prière/jour (pas de doublon)", async () => {
  const mock = freshBrowser();
  await storage.setConfig({
    notifications: true,
    adhan: false,
    location: { type: "city", cityId: "casablanca", name: "Casablanca", latitude: CASABLANCA.latitude, longitude: CASABLANCA.longitude, timezone: TIMEZONE },
  });

  const today = prayerCore.computeDay(CASABLANCA.latitude, CASABLANCA.longitude, JUNE_21, TIMEZONE);
  const alarmName = `prayer:${today.dayKey}:dhuhr`;

  // Léger retard (dans la fenêtre "en cours"), l'alarme doit tout de même notifier.
  const fixedNow = today.dhuhr.getTime() + 5 * 60 * 1000;

  await withFixedNow(fixedNow, () => scheduler.handleAlarm({ name: alarmName }));
  assert.equal(mock._debug.createdNotifications.length, 1);

  // La même alarme se redéclenche (ex: Firefox la relivre) : ne doit pas renotifier.
  await withFixedNow(fixedNow, () => scheduler.handleAlarm({ name: alarmName }));
  assert.equal(mock._debug.createdNotifications.length, 1, "pas de notification en double");
});

test("handlePrayerAlarm : réveil tardif après veille prolongée -> pas de notification pour une prière manquée depuis longtemps", async () => {
  const mock = freshBrowser();
  await storage.setConfig({
    notifications: true,
    adhan: false,
    location: { type: "city", cityId: "casablanca", name: "Casablanca", latitude: CASABLANCA.latitude, longitude: CASABLANCA.longitude, timezone: TIMEZONE },
  });

  const today = prayerCore.computeDay(CASABLANCA.latitude, CASABLANCA.longitude, JUNE_21, TIMEZONE);

  // Le PC dort à travers Dhuhr ET Asr, et se réveille bien après les deux :
  // Firefox relivre les deux alarmes en retard d'un coup à la reprise.
  const fixedNow = today.asr.getTime() + 45 * 60 * 1000;

  await withFixedNow(fixedNow, async () => {
    await scheduler.handleAlarm({ name: `prayer:${today.dayKey}:dhuhr` });
    await scheduler.handleAlarm({ name: `prayer:${today.dayKey}:asr` });
  });

  assert.equal(
    mock._debug.createdNotifications.length,
    0,
    "aucune des deux prières manquées depuis plus de 15 minutes ne doit notifier"
  );
});

test("handlePrayerAlarm : notifications désactivées -> aucune notification créée", async () => {
  const mock = freshBrowser();
  await storage.setConfig({
    notifications: false,
    adhan: false,
    location: { type: "city", cityId: "casablanca", name: "Casablanca", latitude: CASABLANCA.latitude, longitude: CASABLANCA.longitude, timezone: TIMEZONE },
  });

  const today = prayerCore.computeDay(CASABLANCA.latitude, CASABLANCA.longitude, JUNE_21, TIMEZONE);
  const alarmName = `prayer:${today.dayKey}:asr`;
  const fixedNow = today.asr.getTime() + 60_000;

  await withFixedNow(fixedNow, () => scheduler.handleAlarm({ name: alarmName }));
  assert.equal(mock._debug.createdNotifications.length, 0);
});

test("handlePrayerAlarm : Adhan activé joue l'audio puis se termine (pipeline testable sans navigateur réel)", async () => {
  const mock = freshBrowser();
  await storage.setConfig({
    notifications: false,
    adhan: true,
    location: { type: "city", cityId: "casablanca", name: "Casablanca", latitude: CASABLANCA.latitude, longitude: CASABLANCA.longitude, timezone: TIMEZONE },
  });

  let played = false;
  global.Audio = class {
    constructor() {
      this.listeners = {};
    }
    addEventListener(event, cb) {
      this.listeners[event] = cb;
    }
    play() {
      played = true;
      queueMicrotask(() => this.listeners.ended && this.listeners.ended());
      return Promise.resolve();
    }
  };

  const today = prayerCore.computeDay(CASABLANCA.latitude, CASABLANCA.longitude, JUNE_21, TIMEZONE);
  const alarmName = `prayer:${today.dayKey}:maghrib`;
  const fixedNow = today.maghrib.getTime() + 60_000;

  await withFixedNow(fixedNow, () => scheduler.handleAlarm({ name: alarmName }));
  assert.equal(played, true);

  delete global.Audio;
});
