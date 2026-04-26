/**
 * ============================================================
 *  Auto Ad Skipper — content.js
 *  Runs inside every YouTube tab as a content script.
 *
 *  Strategy overview
 *  -----------------
 *  YouTube renders its player in the main document (not an iframe)
 *  and mutates it heavily during navigation and ad playback.
 *  We use two complementary mechanisms:
 *
 *    1. MutationObserver — reacts instantly when YouTube injects
 *       the ad overlay or skip button into the DOM.
 *
 *    2. setInterval polling — a safety net that catches cases
 *       where the DOM mutation fires before the button is fully
 *       interactive, or where the observer misses a rapid change.
 *
 *  Clicking strategy
 *  -----------------
 *  YouTube checks event.isTrusted on click events, so synthesised
 *  MouseEvents (isTrusted = false) are ignored by their handler.
 *  The ONLY reliable approach from a content script is the plain
 *  HTMLElement.click() method — browsers set isTrusted = true for
 *  programmatic .click() calls originating from extension content
 *  scripts. All other approaches (dispatchEvent, script injection)
 *  are unreliable and have been removed.
 *
 *  SPA navigation
 *  --------------
 *  YouTube is a Single-Page Application. The page never fully
 *  reloads when you click a video. We listen to the YouTube-specific
 *  "yt-navigate-finish" event to restart the watcher after each
 *  navigation.
 * ============================================================
 */

(function () {
  'use strict';

  // ──────────────────────────────────────────────────────────
  //  Configuration
  // ──────────────────────────────────────────────────────────

  /**
   * How often (ms) the polling fallback checks for a skip button.
   * Keeping this low (≤1 s) ensures the button is clicked as soon
   * as it appears, without being so aggressive that it hammers the DOM.
   */
  const POLL_INTERVAL_MS = 700;

  /**
   * After a successful click we wait this long before re-enabling
   * the skip routine. This prevents double-clicks on the same ad
   * and gives YouTube time to hide the overlay.
   */
  const COOLDOWN_MS = 1500;

  /**
   * CSS selectors for the "skip ad" button.
   * YouTube occasionally renames these classes, so we keep a small
   * list of known selectors and try each one in order.
   *
   * The selectors below cover:
   *   - New player UI (2024-present):  .ytp-skip-ad-button
   *   - Older "Skip Ad" overlay:       .ytp-ad-skip-button
   *   - Another variant:               .ytp-ad-skip-button-modern
   */
  const SKIP_BUTTON_SELECTORS = [
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '[class*="skip-ad"]',   // catch any future rename that still has "skip-ad"
  ];

  /**
   * CSS selectors that indicate an ad is currently playing.
   * We check these before attempting to find the skip button, so we
   * don't waste cycles on normal video playback.
   */
  const AD_PLAYING_SELECTORS = [
    '.ad-showing',              // class on #movie_player while ad plays
    '.ytp-ad-player-overlay',   // the grey info overlay during an ad
    '.ytp-ad-module',           // ad module container
  ];

  // ──────────────────────────────────────────────────────────
  //  State
  // ──────────────────────────────────────────────────────────

  /** True while we are in the middle of a skip attempt + cooldown. */
  let skipInProgress = false;

  /** Reference to the setInterval timer so we can clear it on cleanup. */
  let pollTimer = null;

  /** Reference to the MutationObserver so we can disconnect on cleanup. */
  let domObserver = null;

  // ──────────────────────────────────────────────────────────
  //  Core detection helpers
  // ──────────────────────────────────────────────────────────

  /**
   * Returns true if YouTube is currently showing an ad.
   *
   * We query the player element rather than document so we only look
   * inside the actual video player, ignoring banner ads in the sidebar.
   *
   * @returns {boolean}
   */
  function isAdPlaying() {
    for (const selector of AD_PLAYING_SELECTORS) {
      if (document.querySelector(selector)) return true;
    }
    return false;
  }

  /**
   * Finds the visible, interactive skip button inside the player.
   *
   * We try each known selector in priority order. For each candidate
   * we verify it is actually visible on screen (offsetParent check
   * works here because the skip button is never position:fixed, unlike
   * the player itself, so offsetParent correctly reflects display state).
   *
   * @returns {HTMLElement|null}
   */
  function findSkipButton() {
    for (const selector of SKIP_BUTTON_SELECTORS) {
      const candidates = document.querySelectorAll(selector);
      for (const el of candidates) {
        // offsetParent is null for hidden elements (display:none / visibility:hidden).
        // Also check that the element has a non-zero bounding box as extra safety.
        if (el.offsetParent !== null || el.getBoundingClientRect().width > 0) {
          return el;
        }
      }
    }

    // Last-resort: scan every button inside the player for the word "skip"
    // in its visible text or aria-label. This covers completely renamed classes.
    const player = document.getElementById('movie_player');
    if (player) {
      const allButtons = player.querySelectorAll('button, [role="button"]');
      for (const btn of allButtons) {
        const label = (
          btn.innerText ||
          btn.textContent ||
          btn.getAttribute('aria-label') ||
          ''
        ).toLowerCase();
        if (label.includes('skip') && btn.getBoundingClientRect().width > 0) {
          return btn;
        }
      }
    }

    return null;
  }

  // ──────────────────────────────────────────────────────────
  //  Ad muting (quality-of-life)
  // ──────────────────────────────────────────────────────────

  /**
   * Mutes the video element while an ad is playing so the user
   * doesn't hear the ad audio during the brief moment before the
   * skip button appears.
   *
   * We store the original muted state and restore it after the ad
   * so we don't permanently mute a user who had sound on.
   */
  let originalMutedState = null;

  function muteAdAudio() {
    const video = document.querySelector('video');
    if (!video) return;
    if (originalMutedState === null) {
      originalMutedState = video.muted;
    }
    video.muted = true;
  }

  function restoreAudio() {
    const video = document.querySelector('video');
    if (!video || originalMutedState === null) return;
    video.muted = originalMutedState;
    originalMutedState = null;
  }

  // ──────────────────────────────────────────────────────────
  //  Main skip action
  // ──────────────────────────────────────────────────────────

  /**
   * Attempts to click the skip button.
   *
   * Uses HTMLElement.click() — the only method that produces a
   * trusted click event from a content script context. Dispatching
   * synthetic MouseEvents via dispatchEvent() yields isTrusted=false,
   * which YouTube's event handler ignores. Injecting a <script> tag
   * to call click() from page context is blocked by YouTube's CSP.
   *
   * The function is guarded by skipInProgress so it can only run one
   * attempt at a time, preventing rapid-fire duplicates.
   */
  async function trySkipAd() {
    if (skipInProgress) return;
    if (!isAdPlaying()) return;

    const btn = findSkipButton();
    if (!btn) {
      // Button not visible yet — mute while we wait for it to appear
      muteAdAudio();
      return;
    }

    skipInProgress = true;
    muteAdAudio();

    console.log('[Auto Ad Skipper] Skip button found — clicking.');

    // HTMLElement.click() is the trusted-context click from content scripts
    btn.click();

    // Give YouTube 1.5 s to process the click and remove the ad overlay
    await new Promise(r => setTimeout(r, COOLDOWN_MS));

    if (!isAdPlaying()) {
      console.log('[Auto Ad Skipper] ✅ Ad skipped successfully.');
      restoreAudio();
    } else {
      // Ad is still playing — either it's non-skippable, or the click
      // didn't register (e.g. button was momentarily stale). Try once more.
      console.log('[Auto Ad Skipper] ⚠️  Ad still playing — retrying once.');
      const btn2 = findSkipButton();
      if (btn2) btn2.click();
      await new Promise(r => setTimeout(r, COOLDOWN_MS));
      if (!isAdPlaying()) {
        restoreAudio();
        console.log('[Auto Ad Skipper] ✅ Ad skipped on retry.');
      } else {
        console.log('[Auto Ad Skipper] ℹ️  Ad appears non-skippable — waiting it out.');
        // Keep audio muted during non-skippable ad, restore when it ends
        waitForAdEnd();
      }
    }

    skipInProgress = false;
  }

  /**
   * Polls until the ad ends, then restores audio.
   * Used only when the ad is non-skippable so we don't leave the
   * user permanently muted.
   */
  function waitForAdEnd() {
    const timer = setInterval(() => {
      if (!isAdPlaying()) {
        clearInterval(timer);
        restoreAudio();
        console.log('[Auto Ad Skipper] ℹ️  Non-skippable ad ended — audio restored.');
      }
    }, 500);
  }

  // ──────────────────────────────────────────────────────────
  //  Watcher lifecycle
  // ──────────────────────────────────────────────────────────

  /**
   * Tears down any existing observer and interval before starting fresh.
   * Called on initial load and after each YouTube SPA navigation.
   */
  function stopWatcher() {
    if (domObserver) {
      domObserver.disconnect();
      domObserver = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  /**
   * Starts monitoring the YouTube player for ads.
   *
   * We wait for #movie_player to exist (YouTube renders it after the
   * JS framework boots, which can take 1–3 s on a cold load), then:
   *
   *   • Attach a MutationObserver to the player's subtree so we
   *     react the moment an ad element is injected into the DOM.
   *
   *   • Start a polling interval as a safety net for cases where
   *     the mutation fires before the skip button is interactive.
   *
   * @param {number} [attempts=0] - internal retry counter
   */
  function startWatcher(attempts = 0) {
    const player = document.getElementById('movie_player');

    if (!player) {
      // Player not in DOM yet — retry up to ~15 s then give up
      if (attempts < 15) {
        setTimeout(() => startWatcher(attempts + 1), 1000);
      } else {
        console.warn('[Auto Ad Skipper] Could not find #movie_player after 15 s — giving up.');
      }
      return;
    }

    stopWatcher(); // clean up any previous session

    // ── MutationObserver ────────────────────────────────────
    // Fires whenever YouTube changes the player's DOM, which happens
    // when an ad starts (ad overlay injected) and when it ends (overlay removed).
    // childList:true + subtree:true gives us the widest coverage with
    // minimal false-positive overhead vs. attributes:true.
    domObserver = new MutationObserver(() => {
      if (isAdPlaying()) {
        trySkipAd();
      }
    });
    domObserver.observe(player, { childList: true, subtree: true });

    // ── Polling fallback ────────────────────────────────────
    pollTimer = setInterval(() => {
      if (isAdPlaying()) {
        trySkipAd();
      }
    }, POLL_INTERVAL_MS);

    console.log('[Auto Ad Skipper] Watching for ads...');

    // Handle the case where the script loads while an ad is already playing
    if (isAdPlaying()) {
      trySkipAd();
    }
  }

  // ──────────────────────────────────────────────────────────
  //  YouTube SPA navigation handling
  // ──────────────────────────────────────────────────────────

  /**
   * YouTube fires "yt-navigate-finish" on the document after each
   * client-side navigation (clicking a video, pressing Back, etc.).
   * This event is part of YouTube's internal Polymer framework and
   * has been stable since 2017. We restart the watcher on each
   * navigation to make sure we're observing the refreshed player.
   */
  document.addEventListener('yt-navigate-finish', () => {
    console.log('[Auto Ad Skipper] YouTube navigation detected — restarting watcher.');
    skipInProgress = false; // reset state for new page
    originalMutedState = null;
    startWatcher();
  });

  // ──────────────────────────────────────────────────────────
  //  Entry point
  // ──────────────────────────────────────────────────────────

  console.log('[Auto Ad Skipper] Loaded.');
  startWatcher();

})();