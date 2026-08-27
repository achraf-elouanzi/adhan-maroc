# Fichier audio requis

Placez ici un fichier nommé `adhan.mp3` (Adhan complet ou court, au choix).

Je n'ai pas inclus de fichier audio par défaut : je n'ai pas de moyen de
récupérer légitimement un enregistrement d'Adhan dont les droits sont
clairs via mes outils, et je préfère vous laisser fournir un fichier dont
vous avez les droits d'utilisation (enregistrement personnel, licence
libre, ou récitant qui autorise la redistribution) plutôt que d'en
embarquer un sans certitude.

Le code (`core/notification.js`) fonctionne sans ce fichier : si
`audio/adhan.mp3` est absent ou illisible, la lecture échoue
silencieusement (erreur loggée en console) sans bloquer la notification
ni le reste de l'extension.

Une fois le fichier ajouté, aucune autre modification n'est nécessaire :
le chemin `browser.runtime.getURL("audio/adhan.mp3")` est déjà utilisé
par `core/notification.js`.
