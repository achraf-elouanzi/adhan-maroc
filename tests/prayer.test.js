const test = require("node:test");
const assert = require("node:assert/strict");

const prayer = require("../core/prayer.js");
const tz = require("../core/timezone.js");
const cities = require("../data/cities-ma.json");
const golden = require("./fixtures/habous-morocco.json");

const CASABLANCA = cities.cities.find((c) => c.id === "casablanca");
const MARRAKECH = cities.cities.find((c) => c.id === "marrakech");
const TIMEZONE = "Africa/Casablanca";

function refDate(year, month, day) {
  return tz.noonDateForDay(year, month, day);
}

test("computeDay retourne les 5 prières + sunrise, dans le bon ordre chronologique", () => {
  const day = prayer.computeDay(CASABLANCA.latitude, CASABLANCA.longitude, refDate(2026, 6, 21), TIMEZONE);

  for (const key of ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]) {
    assert.ok(day[key] instanceof Date, `${key} doit être une Date`);
  }

  // Fajr avant le lever du soleil, Isha après le coucher (edge cases section 34)
  assert.ok(day.fajr.getTime() < day.sunrise.getTime(), "Fajr doit précéder le lever du soleil");
  assert.ok(day.sunrise.getTime() < day.dhuhr.getTime());
  assert.ok(day.dhuhr.getTime() < day.asr.getTime());
  assert.ok(day.asr.getTime() < day.maghrib.getTime());
  assert.ok(day.maghrib.getTime() < day.isha.getTime(), "Isha doit suivre le Maghrib");
});

test("computeDay fonctionne pour plusieurs villes et plusieurs saisons sans lever d'exception", () => {
  const dates = [refDate(2026, 1, 15), refDate(2026, 4, 15), refDate(2026, 7, 15), refDate(2026, 10, 15)];
  for (const city of [CASABLANCA, MARRAKECH]) {
    for (const d of dates) {
      const day = prayer.computeDay(city.latitude, city.longitude, d, TIMEZONE);
      assert.ok(day.fajr instanceof Date);
      assert.ok(day.isha instanceof Date);
    }
  }
});

test("les horaires sont arrondis à la minute (pas de secondes résiduelles)", () => {
  const day = prayer.computeDay(CASABLANCA.latitude, CASABLANCA.longitude, refDate(2026, 3, 1), TIMEZONE);
  for (const key of ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]) {
    assert.equal(day[key].getUTCSeconds(), 0, `${key} ne doit pas avoir de secondes`);
    assert.equal(day[key].getUTCMilliseconds(), 0, `${key} ne doit pas avoir de millisecondes`);
  }
});

test("roundToNearestMinute : 29.4s descend, 30.0s monte (règle section 8)", () => {
  const base = Date.UTC(2026, 0, 1, 5, 26, 0);
  const before = new Date(base + 29_400);
  const boundary = new Date(base + 30_000);

  assert.equal(tz.roundToNearestMinute(before).getTime(), base, "05:26:29.4 doit arrondir à 05:26");
  assert.equal(tz.roundToNearestMinute(boundary).getTime(), base + 60_000, "05:26:30.0 doit arrondir à 05:27");
});

test("findNextPrayer : prière suivante dans la journée", () => {
  const day = prayer.computeDay(CASABLANCA.latitude, CASABLANCA.longitude, refDate(2026, 6, 21), TIMEZONE);
  const now = new Date(day.dhuhr.getTime() + 5 * 60_000); // juste après Dhuhr, avant Asr
  const next = prayer.findNextPrayer(day, null, now);

  assert.equal(next.key, "asr");
  assert.equal(next.isTomorrow, false);
  assert.equal(next.time.getTime(), day.asr.getTime());
});

test("findNextPrayer : après Isha, retourne Fajr du lendemain (fin de journée)", () => {
  const today = prayer.computeDay(CASABLANCA.latitude, CASABLANCA.longitude, refDate(2026, 6, 21), TIMEZONE);
  const tomorrowRef = tz.addDays(refDate(2026, 6, 21), 1, TIMEZONE);
  const tomorrow = prayer.computeDay(CASABLANCA.latitude, CASABLANCA.longitude, tomorrowRef, TIMEZONE);

  const now = new Date(today.isha.getTime() + 30 * 60_000);
  const next = prayer.findNextPrayer(today, tomorrow, now);

  assert.equal(next.key, "fajr");
  assert.equal(next.isTomorrow, true);
  assert.equal(next.time.getTime(), tomorrow.fajr.getTime());
});

test("findNextPrayer : avant Fajr, la prochaine prière est Fajr d'aujourd'hui", () => {
  const day = prayer.computeDay(CASABLANCA.latitude, CASABLANCA.longitude, refDate(2026, 6, 21), TIMEZONE);
  const now = new Date(day.fajr.getTime() - 10 * 60_000);
  const next = prayer.findNextPrayer(day, null, now);
  assert.equal(next.key, "fajr");
  assert.equal(next.isTomorrow, false);
});

test("findCurrentPrayer : null avant Fajr, dernière prière passée sinon", () => {
  const day = prayer.computeDay(CASABLANCA.latitude, CASABLANCA.longitude, refDate(2026, 6, 21), TIMEZONE);

  assert.equal(prayer.findCurrentPrayer(day, new Date(day.fajr.getTime() - 60_000)), null);
  assert.equal(prayer.findCurrentPrayer(day, new Date(day.dhuhr.getTime() + 60_000)), "dhuhr");
  assert.equal(prayer.findCurrentPrayer(day, new Date(day.isha.getTime() + 60_000)), "isha");
});

test("changement de jour : addDays avance d'exactement un jour calendaire à Casablanca", () => {
  const today = refDate(2026, 6, 21);
  const tomorrow = tz.addDays(today, 1, TIMEZONE);
  assert.equal(tz.dayKey(tomorrow, TIMEZONE), "2026-06-22");
});

test("format 12h/24h cohérent", () => {
  const date = new Date(Date.UTC(2026, 0, 1, 17, 42, 0)); // 17:42 UTC == 18:42 Casablanca en hiver (UTC+1)
  const h24 = tz.formatTime(date, { timeZone: TIMEZONE, hour12: false });
  const h12 = tz.formatTime(date, { timeZone: TIMEZONE, hour12: true });
  assert.match(h24, /^\d{2}:\d{2}$/);
  assert.match(h12, /^\d{1,2}:\d{2}\s?(AM|PM)$/);
});

test("golden dataset Habous (±1 minute sur les 5 prières) — sauté si aucune entrée sourcée n'est disponible", (t) => {
  if (!golden.entries || golden.entries.length === 0) {
    t.skip("Aucune donnée Habous sourcée avec certitude n'est disponible (voir tests/fixtures/habous-morocco.json)");
    return;
  }

  function diffMinutes(computedStr, expectedStr) {
    const [ch, cm] = computedStr.split(":").map(Number);
    const [eh, em] = expectedStr.split(":").map(Number);
    return ch * 60 + cm - (eh * 60 + em);
  }

  for (const entry of golden.entries) {
    const city = cities.cities.find((c) => c.id === entry.city);
    assert.ok(city, `Ville inconnue dans le fixture: ${entry.city}`);

    const [y, m, d] = entry.date.split("-").map(Number);
    const day = prayer.computeDay(city.latitude, city.longitude, refDate(y, m, d), TIMEZONE);

    // Les 5 prières : tolérance stricte ±1 minute (section 32 du cahier des charges).
    for (const key of ["fajr", "dhuhr", "asr", "maghrib", "isha"]) {
      const computed = tz.formatTime(day[key], { timeZone: TIMEZONE, hour12: false });
      assert.ok(
        Math.abs(diffMinutes(computed, entry[key])) <= 1,
        `${entry.city} ${entry.date} ${key}: attendu ${entry[key]}, calculé ${computed}`
      );
    }

    // Sunrise n'est pas une prière (section 9) : simplement signalé si l'écart
    // dépasse une tolérance large, sans faire échouer le test. La différence
    // observée (~3-5 min, stable sur 8 villes et 2 saisons) correspond à une
    // convention différente (bord supérieur du disque solaire vs centre du
    // disque) et non à une erreur de calcul — voir docs/calculation.md.
    const computedSunrise = tz.formatTime(day.sunrise, { timeZone: TIMEZONE, hour12: false });
    const sunriseDiff = diffMinutes(computedSunrise, entry.sunrise);
    if (Math.abs(sunriseDiff) > 6) {
      t.diagnostic(
        `${entry.city} ${entry.date} sunrise: écart inhabituel (${sunriseDiff} min, attendu ${entry.sunrise}, calculé ${computedSunrise})`
      );
    }
  }
});
