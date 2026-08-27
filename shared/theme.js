/**
 * shared/theme.js
 *
 * Petit utilitaire UI partagé par popup/options/onboarding : applique le
 * thème choisi (système/clair/sombre) sur <html data-theme="...">. Le
 * CSS de chaque page lit cet attribut ; "system" ne pose aucun attribut
 * et laisse prefers-color-scheme faire le travail.
 */
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") {
    root.setAttribute("data-theme", theme);
  } else {
    root.removeAttribute("data-theme");
  }
}

self.PRTheme = { applyTheme };
