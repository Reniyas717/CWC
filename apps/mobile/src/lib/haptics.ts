/**
 * Haptic feedback helper for mobile web & hybrid webviews.
 * Gracefully no-ops if navigator.vibrate is unsupported (e.g. desktop).
 */
export const haptics = {
  /** Light tap for tab clicks, pills, toggle switches */
  light(): void {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(8);
      }
    } catch {
      // Ignored
    }
  },

  /** Medium tap for primary buttons, deploy action, refresh */
  medium(): void {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(18);
      }
    } catch {
      // Ignored
    }
  },

  /** Heavy tap for actions with consequences (cancel, drain node, dropout simulator) */
  heavy(): void {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([25, 40, 25]);
      }
    } catch {
      // Ignored
    }
  },

  /** Success burst */
  success(): void {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([10, 30, 20]);
      }
    } catch {
      // Ignored
    }
  },
};
