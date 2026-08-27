<p align="center">
  <img src="icons/icon.svg" width="88" alt="Adhan Maroc" />
</p>

<h1 align="center">Adhan Maroc</h1>

<p align="center">
  Les horaires de prière au Maroc, directement dans Firefox.<br/>
  100% local, hors ligne, sans compte, sans tracking.
</p>

---

## ✨ Fonctionnalités

- 🕌 Les 5 prières du jour + heure du lever du soleil
- ⏭️ Prochaine prière et compte à rebours en temps réel
- 🔔 Notification native à l'heure de chaque prière, Adhan optionnel
- 📍 Sélection d'une ville marocaine ou géolocalisation
- 🌗 Thème clair / sombre / système, format 12h ou 24h
- 📡 Aucune connexion Internet requise une fois configuré

Calcul basé sur la méthode du Ministère des Habous et des Affaires
Islamiques (école malikite), validée par comparaison aux horaires
officiels — voir [docs/calculation.md](docs/calculation.md).

## 🔒 Confidentialité

Aucune donnée n'est envoyée à un serveur. Aucune télémétrie, aucun
analytics, aucune publicité. La localisation reste sur l'appareil.
Permissions minimales : `alarms`, `notifications`, `storage`, et
`geolocation` (optionnelle, demandée uniquement si vous l'activez).

## 🚀 Installation

Aucune version signée n'est encore publiée sur addons.mozilla.org.
Installation manuelle (mode développeur) :

1. `about:debugging#/runtime/this-firefox` dans Firefox
2. **Charger un module complémentaire temporaire**
3. Sélectionner `manifest.json` dans ce dossier

## 🛠️ Stack

JavaScript vanilla, aucun framework, aucun build. Calcul astronomique via
[Adhan JS](https://github.com/batoulapps/adhan-js) (vendoré localement).

## 📚 Documentation

- [docs/architecture.md](docs/architecture.md) — architecture, scheduler, notifications, Adhan
- [docs/calculation.md](docs/calculation.md) — méthode de calcul et validation
- [docs/development.md](docs/development.md) — build, tests, lint, structure du projet
