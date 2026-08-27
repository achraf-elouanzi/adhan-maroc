const test = require("node:test");
const assert = require("node:assert/strict");

const storage = require("../core/storage.js");

test("migrate : configuration inexistante retourne les valeurs par défaut", () => {
  const config = storage.migrate(undefined);
  assert.equal(config.schemaVersion, storage.SCHEMA_VERSION);
  assert.equal(config.location, null);
  assert.equal(config.notifications, true);
  assert.equal(config.adhan, true);
  assert.equal(config.timeFormat, "24h");
  assert.equal(config.theme, "system");
  assert.equal(config.onboardingComplete, false);
});

test("migrate : configuration corrompue est réparée champ par champ", () => {
  const config = storage.migrate({
    location: { latitude: "pas un nombre", longitude: -7.5 },
    notifications: "oui",
    adhan: 1,
    timeFormat: "26h",
    theme: "néon",
    onboardingComplete: "vrai",
  });

  assert.equal(config.location, null, "une localisation invalide doit être écartée");
  assert.equal(config.notifications, true, "valeur de secours par défaut");
  assert.equal(config.adhan, true);
  assert.equal(config.timeFormat, "24h");
  assert.equal(config.theme, "system");
  assert.equal(config.onboardingComplete, false);
});

test("migrate : préserve une configuration valide telle quelle", () => {
  const valid = {
    schemaVersion: 1,
    location: { type: "city", cityId: "rabat", name: "Rabat", latitude: 34.02, longitude: -6.84, timezone: "Africa/Casablanca" },
    notifications: false,
    adhan: false,
    timeFormat: "12h",
    theme: "dark",
    onboardingComplete: true,
  };
  const config = storage.migrate(valid);
  assert.deepEqual(config, valid);
});
