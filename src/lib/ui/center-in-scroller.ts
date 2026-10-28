/**
 * Centre un élément dans la barre qui le fait défiler horizontalement (onglets,
 * frise sur mobile), sans faire bouger la page verticalement.
 */
export function centerInScroller(el: Element | null) {
  if (!(el instanceof HTMLElement)) return;
  for (let box = el.parentElement; box; box = box.parentElement) {
    if (box.scrollWidth > box.clientWidth + 1) {
      const target = el.offsetLeft - box.offsetLeft - (box.clientWidth - el.offsetWidth) / 2;
      box.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
      return;
    }
  }
}
