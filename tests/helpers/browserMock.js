/**
 * Faux `browser.*` minimal, en mémoire, pour tester core/scheduler.js et
 * core/storage.js sans navigateur. Ne couvre que les méthodes utilisées
 * par l'extension.
 */
function createBrowserMock() {
  const storageData = {};
  const alarms = new Map();
  const createdNotifications = [];
  let badgeText = "";

  const mock = {
    storage: {
      local: {
        async get(key) {
          if (typeof key === "string") return { [key]: storageData[key] };
          return { ...storageData };
        },
        async set(obj) {
          Object.assign(storageData, obj);
        },
      },
      onChanged: { addListener() {} },
    },
    alarms: {
      async create(name, info) {
        alarms.set(name, { name, ...info });
      },
      async get(name) {
        return alarms.get(name) || null;
      },
      async getAll() {
        return Array.from(alarms.values());
      },
      async clear(name) {
        return alarms.delete(name);
      },
      onAlarm: { addListener() {} },
    },
    action: {
      async setBadgeText({ text }) {
        badgeText = text;
      },
    },
    notifications: {
      async create(id, options) {
        createdNotifications.push({ id, options });
      },
    },
    runtime: {
      getURL: (p) => `moz-extension://test/${p}`,
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onMessage: { addListener() {} },
      sendMessage: async () => {},
    },
    // Accesseurs de test (pas partie de l'API browser réelle)
    _debug: {
      storageData,
      alarms,
      createdNotifications,
      getBadgeText: () => badgeText,
    },
  };

  return mock;
}

module.exports = { createBrowserMock };
