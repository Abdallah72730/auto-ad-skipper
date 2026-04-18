(function() {
    'use strict';

    console.log('Auto Ad Skipper: 🚀 Starting clean ad skipper...');

    // ----- Skip Button Selectors (ordered by specificity) -----
    const SELECTORS = [
        '.ytp-ad-skip-button-modern',
        '.ytp-skip-ad-button',
        '.ytp-ad-skip-button',
        'button[aria-label*="Skip"]',
        'button[aria-label*="Skip Ad"]',
        '.ytp-skip-ad button'
    ];

    // ----- State management to avoid spamming clicks -----
    let lastClickedAd = null;
    let clickAttempts = 0;
    const MAX_ATTEMPTS = 5;

    // ----- Ultra‑Robust Click (bypasses all known YouTube checks) -----
    function forceClick(element) {
        if (!element) return false;

        // 1. Direct click (fastest)
        try { element.click(); } catch(e) {}

        // 2. Simulated mouse events with realistic coordinates
        try {
            const rect = element.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            const eventOptions = {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: centerX,
                clientY: centerY
            };

            ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(type => {
                element.dispatchEvent(new MouseEvent(type, eventOptions));
            });
        } catch(e) {}

        // 3. Trusted‑context injection (bypasses isTrusted)
        try {
            // Build a robust selector for the injected function
            let selector = '';
            if (element.id) {
                // Escape the ID and include the '#'
                selector = `#${CSS.escape(element.id)}`;
            } else {
                // Fallback: use tag name + escaped classes
                const classes = Array.from(element.classList).map(c => `.${CSS.escape(c)}`).join('');
                selector = `${element.tagName.toLowerCase()}${classes}`;
            }

            const script = document.createElement('script');
            script.textContent = `(function() {
                const btn = document.querySelector('${selector}');
                if (btn) {
                    btn.focus();
                    btn.click();
                    // Also dispatch a trusted mouse event
                    const ev = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
                    btn.dispatchEvent(ev);
                }
            })();`;
            document.documentElement.appendChild(script);
            script.remove();
        } catch(e) {}

        return true;
    }

    // ----- Check if an ad is actually playing -----
    function isAdPlaying() {
        const player = document.getElementById('movie_player');
        if (!player) return false;
        // Look for ad badge or ad overlay
        return !!(
            player.querySelector('.ytp-ad-player-overlay') ||
            player.querySelector('.ytp-ad-module') ||
            player.querySelector('.video-ads') ||
            player.classList.contains('ad-showing')
        );
    }

    // ----- Main skip logic with verification -----
    async function trySkip() {
        const player = document.getElementById('movie_player');
        if (!player) return false;

        // Skip if no ad is playing (save CPU)
        if (!isAdPlaying()) return false;

        // Find the skip button
        let skipButton = null;
        for (const sel of SELECTORS) {
            const btn = player.querySelector(sel);
            if (btn && btn.offsetParent !== null) {
                skipButton = btn;
                break;
            }
        }

        // Text fallback
        if (!skipButton) {
            const buttons = player.querySelectorAll('button, [role="button"]');
            for (const btn of buttons) {
                const text = (btn.innerText || '').toLowerCase();
                if (text.includes('skip') && btn.offsetParent !== null) {
                    skipButton = btn;
                    break;
                }
            }
        }

        if (!skipButton) return false;

        // Prevent clicking the same button repeatedly in the same ad session
        const adId = player.querySelector('.ytp-ad-module')?.innerHTML?.length || Date.now();
        if (lastClickedAd === adId) {
            clickAttempts++;
            if (clickAttempts > MAX_ATTEMPTS) {
                console.log('Auto Ad Skipper: ⏸️ Max attempts reached for this ad, pausing...');
                return false;
            }
        } else {
            lastClickedAd = adId;
            clickAttempts = 0;
        }

        console.log(`Auto Ad Skipper: 🎯 Clicking skip button (attempt ${clickAttempts + 1})`);
        forceClick(skipButton);

        // Verify if the ad is still playing after a short delay
        setTimeout(() => {
            if (isAdPlaying()) {
                // Ad still present, schedule another attempt
                console.log('Auto Ad Skipper: 🔁 Ad still playing, retrying...');
                scheduleCheck(true);
            } else {
                console.log('Auto Ad Skipper: ✅ Ad skipped successfully!');
                lastClickedAd = null;
                clickAttempts = 0;
            }
        }, 300);

        return true;
    }

    // ----- Debounced scheduler -----
    let checkScheduled = false;
    let checkInterval = null;

    function scheduleCheck(immediate = false) {
        if (checkScheduled && !immediate) return;
        checkScheduled = true;

        const execute = () => {
            try {
                trySkip();
            } finally {
                checkScheduled = false;
            }
        };

        if (immediate) {
            execute();
        } else {
            requestAnimationFrame(execute);
        }
    }

    // ----- Observer + Polling -----
    function startObserver() {
        const player = document.getElementById('movie_player');
        if (!player) {
            setTimeout(startObserver, 1000);
            return;
        }

        const observer = new MutationObserver(() => {
            scheduleCheck();
        });
        observer.observe(player, { childList: true, subtree: true });

        // Poll every 1 second as fallback
        if (checkInterval) clearInterval(checkInterval);
        checkInterval = setInterval(() => scheduleCheck(), 1000);

        console.log('Auto Ad Skipper: 👀 Watching for ads...');
        scheduleCheck(true);
    }

    startObserver();
})();