(function() {
    'use strict';

    console.log('Auto Ad Skipper: 🚀 Starting v2.0');

    // ----- Helper: Wait for a bit -----
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // ----- Find the skip button using text (most robust) -----
    function findSkipButton() {
        const player = document.getElementById('movie_player');
        if (!player) return null;

        // Look for any button containing "Skip" or "Skip Ad"
        const buttons = player.querySelectorAll('button, [role="button"]');
        for (const btn of buttons) {
            const text = (btn.innerText || btn.getAttribute('aria-label') || '').toLowerCase();
            if (text.includes('skip') && btn.offsetParent !== null) {
                return btn;
            }
        }
        return null;
    }

    // ----- Check if an ad is actually playing -----
    function isAdPlaying() {
        const player = document.getElementById('movie_player');
        if (!player) return false;
        return !!(
            player.querySelector('.ytp-ad-player-overlay') ||
            player.querySelector('.ytp-ad-module') ||
            player.classList.contains('ad-showing')
        );
    }

    // ----- Ultra‑reliable click -----
    async function clickSkipButton(btn) {
        if (!btn) return false;

        // 1. Focus the button
        btn.focus();

        // 2. Get exact screen coordinates
        const rect = btn.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        // 3. Simulate a full mouse click sequence at those coordinates
        const eventOpts = {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            screenX: window.screenX + x,
            screenY: window.screenY + y
        };

        btn.dispatchEvent(new MouseEvent('mouseover', eventOpts));
        btn.dispatchEvent(new MouseEvent('mousedown', eventOpts));
        btn.dispatchEvent(new MouseEvent('mouseup', eventOpts));
        btn.dispatchEvent(new MouseEvent('click', eventOpts));

        // 4. Also send an "Enter" key event (some ads respond to keyboard)
        btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        btn.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));

        // 5. Trusted‑context injection as final fallback
        try {
            let selector;
            if (btn.id) {
                selector = `#${CSS.escape(btn.id)}`;
            } else {
                const classes = Array.from(btn.classList).map(c => `.${CSS.escape(c)}`).join('');
                selector = `${btn.tagName.toLowerCase()}${classes}`;
            }
            const script = document.createElement('script');
            script.textContent = `(function() {
                const b = document.querySelector('${selector}');
                if (b) { b.click(); }
            })();`;
            document.documentElement.appendChild(script);
            script.remove();
        } catch(e) {}

        return true;
    }

    // ----- Main skip routine -----
    let isSkipping = false;
    async function performSkip() {
        if (isSkipping) return;
        isSkipping = true;

        try {
            if (!isAdPlaying()) return;

            const btn = findSkipButton();
            if (!btn) return;

            console.log('Auto Ad Skipper: 🎯 Found skip button, clicking...');
            await clickSkipButton(btn);

            // Wait and verify
            await wait(800);
            if (isAdPlaying()) {
                console.log('Auto Ad Skipper: 🔁 Ad still playing, retrying once more...');
                await clickSkipButton(btn);
                await wait(800);
            }

            if (!isAdPlaying()) {
                console.log('Auto Ad Skipper: ✅ Ad skipped!');
            } else {
                console.log('Auto Ad Skipper: ⚠️ Could not skip (maybe non‑skippable ad)');
            }
        } finally {
            isSkipping = false;
        }
    }

    // ----- Observer + Polling -----
    let checkInterval = null;

    function start() {
        const player = document.getElementById('movie_player');
        if (!player) {
            setTimeout(start, 1000);
            return;
        }

        // Watch for DOM changes
        const observer = new MutationObserver(() => {
            if (isAdPlaying()) {
                performSkip();
            }
        });
        observer.observe(player, { childList: true, subtree: true });

        // Poll every 1.5 seconds as backup
        if (checkInterval) clearInterval(checkInterval);
        checkInterval = setInterval(() => {
            if (isAdPlaying()) {
                performSkip();
            }
        }, 1500);

        console.log('Auto Ad Skipper: 👀 Monitoring for ads...');
        // Immediate check in case ad already playing
        if (isAdPlaying()) performSkip();
    }

    start();
})();