/** The first-run tour shows once per browser; Help can replay it. */
export const TOUR_KEY = 'tatami.tourSeen';
export const TOUR_EVENT = 'tatami:open-tour';

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) === '1';
  } catch {
    // Storage blocked (private mode): don't nag on every page.
    return true;
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(TOUR_KEY, '1');
  } catch {
    /* not persisted */
  }
}

export function openTour() {
  window.dispatchEvent(new Event(TOUR_EVENT));
}
