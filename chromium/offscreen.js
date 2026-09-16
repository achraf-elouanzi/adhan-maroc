/**
 * chromium/offscreen.js
 *
 * Document offscreen (Chrome/Edge uniquement) : seul contexte MV3 avec un
 * vrai DOM où l'Adhan peut être joué, le service worker n'en ayant aucun.
 * Ne fait rien d'autre que jouer l'audio et prévenir le service worker
 * quand c'est terminé — seule l'API runtime (messages) est utilisable
 * dans un document offscreen.
 */
chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== "play-adhan") return;

  const audio = new Audio(message.url);
  const finish = () => {
    chrome.runtime.sendMessage({ type: "adhan-ended" }).catch(() => {});
  };

  audio.addEventListener("ended", finish, { once: true });
  audio.addEventListener("error", finish, { once: true });
  audio.play().catch((error) => {
    console.error("Adhan Maroc: lecture Adhan impossible (offscreen)", error);
    finish();
  });
});
