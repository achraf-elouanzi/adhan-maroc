/**
 * background/background.js
 *
 * Point d'entrée du background (event page MV3 Firefox). Reste
 * volontairement minimal : ce fichier ne fait qu'enregistrer les
 * écouteurs et déléguer à core/scheduler.js. Les écouteurs doivent être
 * enregistrés de manière synchrone, au premier tour de la boucle
 * d'événements, pour que Firefox les reconnecte fiablement à chaque
 * réveil de l'event page.
 */

browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    browser.tabs.create({ url: browser.runtime.getURL("onboarding/onboarding.html") });
  }
  self.PRScheduler.reconcile();
});

browser.runtime.onStartup.addListener(() => {
  self.PRScheduler.reconcile();
});

browser.alarms.onAlarm.addListener((alarm) => {
  self.PRScheduler.handleAlarm(alarm);
});

// Réagit à un changement de localisation (ou toute autre modification de
// config touchant la planification) déclenché depuis les paramètres.
browser.runtime.onMessage.addListener((message) => {
  if (message && message.type === "location-changed") {
    self.PRScheduler.onLocationChanged();
  }
});

// Le script s'exécute aussi bien au premier lancement qu'à chaque réveil
// de l'event page (ex: alarme "badge-tick" reçue avant que les
// écouteurs ci-dessus ne soient déjà en place lors d'un tout premier
// chargement) : on relance une réconciliation au chargement pour rester
// self-healing dans tous les cas.
self.PRScheduler.reconcile();
