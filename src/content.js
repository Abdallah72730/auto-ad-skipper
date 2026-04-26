/**
 * ============================================================
 *  Auto Ad Skipper — content.js
 * ============================================================
 *
 *  How it works
 *  ------------
 *  When an ad is detected, we seek the video to its end.
 *  We check isAdPlaying() both before AND after the seek to make
 *  sure we never touch the main video.
 *
 *  The key guard: we only act when .ad-showing is on #movie_player.
 *  That class is added by YouTube exclusively during ad playback
 *  and removed the moment the main video starts. We check for it
 *  immediately before every seek so we never skip the real video.
 */

(function () {
  'use strict';

  const POLL_INTERVAL_MS = 700;
  const COOLDOWN_MS = 2000;

  let cooldown = false;

  /**
   * Returns true ONLY when an ad is actively playing.
   * .ad-showing is the most reliable signal — YouTube adds it to
   * #movie_player during ad playback and removes it immediately
   * when the main video resumes. We use this as our primary guard.
   */
  function isAdPlaying() {
    const player = document.getElementById('movie_player');
    if (!player) return false;
    return player.classList.contains('ad-showing');
  }

  /**
   * Skips the current ad by seeking the video to its end.
   * Double-checks isAdPlaying() right before seeking to avoid
   * accidentally skipping the main video.
   */
  function skipAd() {
    if (cooldown) return;
    if (!isAdPlaying()) return;

    const video = document.querySelector('video');
    if (!video) return;

    // Final safety check — bail if ad ended between the checks above
    if (!isAdPlaying()) return;

    const duration = video.duration;
    if (!duration || !isFinite(duration)) return; // duration not ready yet, poll will retry

    console.log(`[Auto Ad Skipper] Ad playing — seeking to end (${duration.toFixed(1)}s).`);
    video.currentTime = duration;

    cooldown = true;
    setTimeout(() => { cooldown = false; }, COOLDOWN_MS);
  }

  // React instantly when YouTube mutates the player DOM (ad starting/ending)
  const observer = new MutationObserver(skipAd);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  // Polling fallback
  setInterval(skipAd, POLL_INTERVAL_MS);

  // Reset on navigation
  document.addEventListener('yt-navigate-finish', () => {
    cooldown = false;
    console.log('[Auto Ad Skipper] Navigation detected — ready.');
  });

  console.log('[Auto Ad Skipper] Running.');

})();