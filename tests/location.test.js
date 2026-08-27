const test = require("node:test");
const assert = require("node:assert/strict");

const location = require("../core/location.js");

test("loadCitiesData retourne au moins les 20 villes marocaines requises", async () => {
  const data = await location.loadCitiesData();
  assert.ok(data.cities.length >= 20);
  for (const city of data.cities) {
    assert.equal(typeof city.name, "string");
    assert.ok(location.isValidCoordinates(city.latitude, city.longitude), `${city.name} a des coordonnées invalides`);
  }
});

test("findCityById trouve une ville existante et retourne null sinon", async () => {
  const { cities } = await location.loadCitiesData();
  assert.equal(location.findCityById(cities, "casablanca").name, "Casablanca");
  assert.equal(location.findCityById(cities, "ville-inexistante"), null);
});

test("isValidCoordinates rejette les valeurs invalides (localisation invalide, section 34)", () => {
  assert.equal(location.isValidCoordinates(33.5, -7.5), true);
  assert.equal(location.isValidCoordinates(200, -7.5), false); // latitude hors plage
  assert.equal(location.isValidCoordinates(33.5, -200), false); // longitude hors plage
  assert.equal(location.isValidCoordinates(NaN, -7.5), false);
  assert.equal(location.isValidCoordinates("33.5", -7.5), false);
});

test("buildLocationFromCity lève GeolocationError pour une ville invalide", () => {
  assert.throws(() => location.buildLocationFromCity(null, "Africa/Casablanca"), location.GeolocationError);
  assert.throws(
    () => location.buildLocationFromCity({ id: "x", name: "X", latitude: 999, longitude: 0 }, "Africa/Casablanca"),
    location.GeolocationError
  );
});

test("buildLocationFromCoordinates valide les coordonnées de géolocalisation", () => {
  const loc = location.buildLocationFromCoordinates(33.5731, -7.5898, "Africa/Casablanca");
  assert.equal(loc.type, "geolocation");
  assert.equal(loc.timezone, "Africa/Casablanca");

  assert.throws(() => location.buildLocationFromCoordinates(999, 0, "Africa/Casablanca"), location.GeolocationError);
});
