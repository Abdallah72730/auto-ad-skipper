/**
 * ============================================================
 *  Auto Ad Skipper — content.js
 * ============================================================
 *
 *  How it works
 *  ------------
 *  Every 700 ms (and on every DOM mutation) we look for the
 *  skip button directly. If it exists and is visible, we click it.
 *  No ad-detection guard — we just look for the button itself.
 *  If the button isn't there, nothing happens. Simple and robust.
 *
 *  Why btn.click() and not dispatchEvent?
 *  ---------------------------------------
 *  YouTube ignores synthetic click events (isTrusted = false).
 *  HTMLElement.click() called from a content script produces a
 *  trusted event and works correctly.
 */

(function () {
  'use strict';

  /**
   * Ordered list of CSS selectors for the skip button.
   * We try each one until we find a visible element.
   */
  const SKIP_SELECTORS = [
    '.ytp-skip-ad-button',        // current YouTube UI (2024-present)
    '.ytp-ad-skip-button',        // older variant
    '.ytp-ad-skip-button-modern', // another older variant
    '[class*="skip-ad"]',         // future-proof: any class containing "skip-ad"
  ];

  /** Cooldown in ms after clicking to avoid double-clicks. */
  const COOLDOWN_MS = 1500;

  let cooldown = false;

  /**
   * Finds the skip button if it is currently visible on screen.
   *
   * Tries each known selector first, then falls back to scanning
   * all buttons inside the player for the word "skip" in their text.
   *
   * @returns {HTMLElement|null}
   */
  function findSkipButton() {
    // Try known selectors first (fast path)
    for (const sel of SKIP_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
        return el;
      }
    }

    // Fallback: scan all buttons in the player for "skip" text
    const player = document.getElementById('movie_player');
    if (!player) return null;

    for (const btn of player.querySelectorAll('button, [role="button"]')) {
      const text = (btn.textContent || btn.getAttribute('aria-label') || '').toLowerCase();
      if (text.includes('skip') && btn.offsetWidth > 0) {
        return btn;
      }
    }

    return null;
  }

  /**
   * Main routine — finds and clicks the skip button if available.
   * Guarded by a cooldown to prevent rapid-fire clicks.
   */
  function trySkip() {
    if (cooldown) return;

    const btn = findSkipButton();
    if (!btn) return;

    console.log('[Auto Ad Skipper] Clicking skip button.');
    btn.click();

    cooldown = true;
    setTimeout(() => { cooldown = false; }, COOLDOWN_MS);
  }

  /**
   * Watch the entire document body for DOM changes.
   * YouTube injects the skip button into the DOM once the countdown
   * ends — the MutationObserver fires instantly at that moment.
   */
  const observer = new MutationObserver(trySkip);
  observer.observe(document.body, { childList: true, subtree: true });

  /**
   * Polling fallback — runs every 700 ms.
   * Catches cases where the MutationObserver fires before the button
   * is fully rendered / has a non-zero size.
   */
  setInterval(trySkip, 700);

  /**
   * Handle YouTube SPA navigation.
   * YouTube fires "yt-navigate-finish" after every client-side page
   * change. We reset the cooldown so the new video's ad can be skipped.
   */
  document.addEventListener('yt-navigate-finish', () => {
    cooldown = false;
    console.log('[Auto Ad Skipper] Navigation detected — ready.');
  });

  console.log('[Auto Ad Skipper] Running.');

})();