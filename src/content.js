/**
 * ============================================================
 *  Auto Ad Skipper — content.js
 * ============================================================
 *
 *  How it works
 *  ------------
 *  When an ad is detected, we skip it by seeking the video element
 *  to its end (currentTime = duration). This bypasses YouTube's
 *  isTrusted click check entirely — we never need to click anything.
 *
 *  For skippable ads: seeking to the end triggers the skip.
 *  For non-skippable ads: seeking to the end plays them out instantly.
 *
 *  Ad detection
 *  ------------
 *  We check for the presence of known ad indicator elements in the DOM.
 *  We also watch for the skip button appearing as a secondary signal.
 */

(function () {
  'use strict';

  const POLL_INTERVAL_MS = 700;
  const COOLDOWN_MS = 2000;

  let cooldown = false;

  /**
   * Returns true if an ad is currently playing.
   * Checks for known ad overlay elements that YouTube injects
   * into the player during ad playback.
   */
  function isAdPlaying() {
    return !!(
      document.querySelector('.ad-showing') ||
      document.querySelector('.ytp-ad-player-overlay') ||
      document.querySelector('.ytp-ad-module') ||
      document.querySelector('.ytp-skip-ad-button') ||
      document.querySelector('.ytp-ad-skip-button') ||
      document.querySelector('.ytp-ad-skip-button-modern')
    );
  }

  /**
   * Skips the ad by seeking the video to its end.
   *
   * This works because:
   *  - YouTube's ad player is a standard <video> element
   *  - Setting currentTime = duration causes the player to
   *    treat the ad as finished and move to the next content
   *  - This requires no click event, so isTrusted is irrelevant
   */
  function skipAd() {
    if (cooldown) return;
    if (!isAdPlaying()) return;

    const video = document.querySelector('video');
    if (!video) return;

    // Seeking to duration ends the ad immediately
    if (video.duration && isFinite(video.duration)) {
      console.log(`[Auto Ad Skipper] Ad detected — seeking to end (duration: ${video.duration.toFixed(1)}s).`);
      video.currentTime = video.duration;
    } else {
      // Duration not yet known — set a very high value as fallback
      console.log('[Auto Ad Skipper] Ad detected — duration unknown, seeking to 9999.');
      video.currentTime = 9999;
    }

    cooldown = true;
    setTimeout(() => { cooldown = false; }, COOLDOWN_MS);
  }

  // Watch DOM for ad elements being injected
  const observer = new MutationObserver(skipAd);
  observer.observe(document.body, { childList: true, subtree: true });

  // Poll as a safety net
  setInterval(skipAd, POLL_INTERVAL_MS);

  // Reset cooldown on navigation so new video ads are caught
  document.addEventListener('yt-navigate-finish', () => {
    cooldown = false;
    console.log('[Auto Ad Skipper] Navigation detected — ready.');
  });

  console.log('[Auto Ad Skipper] Running.');

})();