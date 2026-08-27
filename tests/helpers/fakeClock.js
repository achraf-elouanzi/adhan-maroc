/**
 * Fige `new Date()` / `Date.now()` sur un instant donné pendant l'exécution
 * de `fn` (async), pour rendre déterministes les tests qui dépendent de
 * "l'heure actuelle". `new Date(...)` avec arguments continue de
 * fonctionner normalement.
 */
async function withFixedNow(fixedMs, fn) {
  const RealDate = Date;

  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(fixedMs);
      } else {
        super(...args);
      }
    }
    static now() {
      return fixedMs;
    }
  }

  global.Date = FakeDate;
  try {
    return await fn();
  } finally {
    global.Date = RealDate;
  }
}

module.exports = { withFixedNow };
