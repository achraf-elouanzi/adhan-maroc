# Méthode de calcul

## Paramètres (cible Maroc / école malikite)

| Prière   | Règle                                   | Implémentation Adhan JS |
|----------|------------------------------------------|--------------------------|
| Fajr     | 19° de dépression solaire, sans correction | `fajrAngle = 19`          |
| Sunrise  | lever astronomique (information secondaire, pas une prière — voir note ci-dessous) | calculé par la lib |
| Dhuhr    | midi solaire **+ 5 min** (marge de précaution "ihtiyat", sourcée) | `adjustments.dhuhr = 5` |
| Asr      | shadow factor = 1, sans correction        | `madhab = Madhab.Shafi` (nom de la lib ; produit un facteur d'ombre 1, indépendamment de l'étiquette juridique — c'est le facteur qui compte, pas le nom) |
| Maghrib  | coucher du soleil **+ 5 min** (marge de précaution "ihtiyat", sourcée) | `adjustments.maghrib = 5` |
| Isha     | 17° de dépression solaire, sans correction | `ishaAngle = 17` |

`rounding` est mis à `Rounding.None` côté bibliothèque : c'est
`core/timezone.js#roundToNearestMinute` qui applique la seule règle
d'arrondi utilisée par l'extension (05:26:29 → 05:26, 05:26:30 → 05:27),
de façon identique pour l'affichage, les notifications et les tests.

Voir `core/prayer.js` pour l'implémentation exacte.

### Correction Dhuhr/Maghrib (+5 min) — preuve et méthode

Le cahier des charges initial interdisait d'ajouter une correction sans
preuve ("ne pas ajouter +5 minutes à Dhuhr ou Maghrib sans preuve"). Cette
preuve a été obtenue en comparant le calcul de cette extension aux
horaires publiés par le Ministère des Habous lui-même
(`habous.gov.ma/prieres/index.php`, tableau mensuel officiel, un
identifiant `ville=<id>` par ville) :

- **8 villes**, le 26/08/2026 (Rabat, Casablanca, Marrakech, Fès, Tanger,
  Agadir, Oujda, Safi) — date confirmée par recoupement du jour de la
  semaine affiché dans le tableau.
- **1 point hiver** (solstice, 22/12/2024) pour Rabat, récupéré via une
  capture Wayback Machine du même site officiel
  (`web.archive.org/web/20241222165442/…habous.gov.ma/prieres/index.php`),
  également recoupé par jour de la semaine.

Résultat, calcul astronomique pur moins horaire officiel :

| Prière  | Écart (8 villes, été) | Écart (Rabat, hiver) |
|---------|------------------------|------------------------|
| Fajr    | 0 à +1 min             | +1 min                 |
| Sunrise | +3 à +5 min            | +4 min                 |
| Dhuhr   | **-5 à -6 min**        | **-5 min**              |
| Asr     | 0 à -1 min             | 0 min                  |
| Maghrib | **-4 à -6 min**        | **-4 min**              |
| Isha    | -1 à 0 min             | 0 min                   |

L'écart Dhuhr/Maghrib est resté quasi identique (~5 min) sur 8 villes
réparties sur tout le territoire et sur deux saisons opposées (été /
solstice d'hiver) : ce n'est ni un effet géographique ni un effet
saisonnier, donc pas un artefact de la formule astronomique — c'est une
marge fixe appliquée par le Ministère. `core/prayer.js` la reproduit via
`adjustments.dhuhr = 5` et `adjustments.maghrib = 5`. Les 9 points de
mesure sont conservés dans `tests/fixtures/habous-morocco.json` (golden
dataset) et validés automatiquement (±1 minute) par
`tests/prayer.test.js`.

**Sunrise** garde un écart non corrigé de 3 à 5 minutes (le calcul
l'affiche légèrement plus tard que le Ministère). Comme le sunrise n'est
qu'une information secondaire et n'est jamais utilisé pour déclencher une
prière ou une notification (section 9 du cahier des charges), et que
l'écart est cohérent avec une différence de convention usuelle (bord
supérieur du disque solaire au moment où il touche l'horizon, plutôt que
le centre du disque, éventuellement combiné à une hypothèse de réfraction
atmosphérique légèrement différente), aucune correction n'a été ajoutée
sans preuve plus poussée sur cette valeur précise — seul un diagnostic
est émis dans les tests si l'écart dépassait 6 minutes.

## Fuseau horaire

`Africa/Casablanca` (identifiant IANA), jamais un offset numérique fixe.
Le Maroc a basculé plusieurs fois entre UTC+0 et UTC+1 (dérogation
pendant une partie du Ramadan, décidée par décret et changeante d'une
année sur l'autre). En s'appuyant uniquement sur `Intl.DateTimeFormat`
avec cet identifiant, l'extension hérite des mises à jour de la base
tzdata livrée avec les mises à jour de Firefox, sans code à maintenir ici
si la règle marocaine change à nouveau.

## Bibliothèque

[Adhan JS](https://github.com/batoulapps/adhan-js) (MIT), vendorée
localement dans `vendor/adhan.umd.min.js` (bundle UMD téléchargé une
fois depuis le registre npm officiel, aucun CDN n'est utilisé à
l'exécution). Licence complète : `vendor/adhan.LICENSE`.

## Validation — golden dataset Habous

`tests/fixtures/habous-morocco.json` contient 9 points de mesure sourcés
depuis `habous.gov.ma/prieres/index.php` (8 villes le 26/08/2026 + Rabat
au solstice d'hiver 2024-12-22 via Wayback Machine), chacun avec une
`source` vérifiable et une date confirmée par recoupement du jour de la
semaine. `tests/prayer.test.js` compare chaque prière calculée à la
référence avec une tolérance de ±1 minute (sunrise excepté, voir
ci-dessus) — voir la section précédente pour le détail des écarts
observés et la correction qui en a résulté.

**Pour étendre la validation** : deux saisons (été et solstice d'hiver)
sont couvertes ; ajouter un point printemps/automne (équinoxes)
renforcerait la confiance, en particulier si vous avez accès à une
capture Wayback Machine ou une donnée officielle d'une de ces périodes.
`habous.gov.ma/prieres/index.php` n'affiche que le mois hégirien courant
(pas de paramètre pour consulter une autre date), d'où le recours à
Wayback Machine pour le point hiver. En cas de nouvel écart constaté, ne
pas modifier les angles/paramètres sans en comprendre la cause (fuseau,
coordonnées, arrondi, convention de la source) — documenter l'écart ici
plutôt que de l'ajuster arbitrairement, comme cela a été fait pour
Dhuhr/Maghrib.

## Limites connues

- Aucune correction spécifique n'est appliquée pour les très hautes
  latitudes (non pertinent pour les villes marocaines couvertes par
  `data/cities-ma.json`, mais `core/prayer.js` reste générique — voir
  `HighLatitudeRule` par défaut de la bibliothèque si le périmètre
  s'élargissait un jour).
- L'algorithme interne exact du Ministère des Habous n'est pas reproduit
  formule par formule : cette extension utilise une configuration
  astronomique standard (19°/17°/facteur 1/coucher/midi solaire) destinée
  à s'en approcher, à valider par le golden dataset ci-dessus.
