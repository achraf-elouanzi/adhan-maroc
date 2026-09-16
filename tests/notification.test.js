const test = require("node:test");
const assert = require("node:assert/strict");

const { createBrowserMock } = require("./helpers/browserMock.js");
const notification = require("../core/notification.js");

function freshBrowser() {
  const mock = createBrowserMock();
  global.browser = mock;
  return mock;
}

/** Faux `chrome.*` minimal pour tester le chemin offscreen (Chrome/Edge). */
function fakeChromeOffscreen() {
  const listeners = [];
  let documentExists = false;
  let createDocumentCalls = 0;

  const chrome = {
    runtime: {
      getContexts: async () => (documentExists ? [{}] : []),
      sendMessage: async (message) => {
        if (message.type === "play-adhan") {
          queueMicrotask(() => listeners.slice().forEach((cb) => cb({ type: "adhan-ended" })));
        }
      },
      onMessage: {
        addListener: (cb) => listeners.push(cb),
        removeListener: (cb) => {
          const i = listeners.indexOf(cb);
          if (i >= 0) listeners.splice(i, 1);
        },
      },
      getURL: (p) => `chrome-extension://test/${p}`,
    },
    offscreen: {
      createDocument: async () => {
        createDocumentCalls += 1;
        documentExists = true;
      },
    },
  };

  return { chrome, get createDocumentCalls() { return createDocumentCalls; } };
}

test("isAudioAvailable / isChromiumServiceWorker : détection d'environnement", () => {
  freshBrowser();
  delete global.Audio;
  delete global.chrome;
  assert.equal(notification.isAudioAvailable(), false);
  assert.equal(notification.isChromiumServiceWorker(), false);

  global.Audio = class {};
  assert.equal(notification.isAudioAvailable(), true);
  delete global.Audio;

  global.chrome = fakeChromeOffscreen().chrome;
  assert.equal(notification.isChromiumServiceWorker(), true);
  delete global.chrome;
});

test("notificationIconUrl : SVG sur Firefox, PNG sur Chrome/Edge (pas de support SVG pour les notifications)", () => {
  const mock = freshBrowser();
  delete global.Audio;
  delete global.chrome;

  assert.match(notification.notificationIconUrl(), /icon\.svg$/);

  global.chrome = fakeChromeOffscreen().chrome;
  assert.match(notification.notificationIconUrl(), /icon-128\.png$/);
  delete global.chrome;
});

test("playAdhan : passe par le document offscreen quand Audio n'existe pas (service worker Chrome/Edge)", async () => {
  freshBrowser();
  delete global.Audio;
  const fake = fakeChromeOffscreen();
  global.chrome = fake.chrome;

  await notification.playAdhan();

  assert.equal(fake.createDocumentCalls, 1, "doit créer le document offscreen s'il n'existe pas déjà");
  delete global.chrome;
});

test("playAdhan : ne recrée pas le document offscreen s'il existe déjà", async () => {
  freshBrowser();
  delete global.Audio;
  const fake = fakeChromeOffscreen();
  global.chrome = fake.chrome;

  await notification.playAdhan(); // crée le document
  await notification.playAdhan(); // le réutilise

  assert.equal(fake.createDocumentCalls, 1);
  delete global.chrome;
});

test("playAdhan : ni Audio ni offscreen disponibles -> se termine proprement sans lever d'exception", async () => {
  freshBrowser();
  delete global.Audio;
  delete global.chrome;

  await assert.doesNotReject(() => notification.playAdhan());
});
