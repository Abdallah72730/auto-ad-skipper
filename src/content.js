/**
 * ============================================================
 *  Auto Ad Skipper — content.js
 * ============================================================
 *
 *  How it works
 *  ------------
 *  When an ad is detected via the .ad-showing class on #movie_player,
 *  we seek the video to its end — but ONLY if the video duration is
 *  under 3 minutes (180s). YouTube ads are never longer than this.
 *  The main video will always have a much longer duration, so this
 *  prevents us from accidentally skipping it.
 */

(function () {
  'use strict';

  const POLL_INTERVAL_MS = 700;
  const COOLDOWN_MS = 2000;

  /**
   * Maximum duration in seconds we'll consider an ad.
   * Skippable ads max out at ~3 min. We use 300s (5 min) as a
   * generous upper bound to catch any edge cases.
   */
  const MAX_AD_DURATION_S = 300;

  let cooldown = false;

  function isAdPlaying() {
    const player = document.getElementById('movie_player');
    return player ? player.classList.contains('ad-showing') : false;
  }

  function skipAd() {
    if (cooldown) return;
    if (!isAdPlaying()) return;

    const video = document.querySelector('video');
    if (!video) return;

    const duration = video.duration;

    // Safety guard: if duration is unknown or longer than MAX_AD_DURATION_S,
    // this is the main video — do NOT seek.
    if (!duration || !isFinite(duration)) {
      console.log('[Auto Ad Skipper] Ad detected but duration unknown — waiting.');
      return;
    }

    if (duration > MAX_AD_DURATION_S) {
      console.log(`[Auto Ad Skipper] Duration ${duration.toFixed(1)}s exceeds max ad length — skipping seek to protect main video.`);
      return;
    }

    console.log(`[Auto Ad Skipper] Ad detected (${duration.toFixed(1)}s) — seeking to end.`);
    video.currentTime = duration;

    cooldown = true;
    setTimeout(() => { cooldown = false; }, COOLDOWN_MS);
  }

  const observer = new MutationObserver(skipAd);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });

  setInterval(skipAd, POLL_INTERVAL_MS);

  document.addEventListener('yt-navigate-finish', () => {
    cooldown = false;
    console.log('[Auto Ad Skipper] Navigation detected — ready.');
  });

  console.log('[Auto Ad Skipper] Running.');

})();