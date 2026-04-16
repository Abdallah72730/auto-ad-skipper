// This document contains the complete engine for Auto Ad Skipper
// Includes three tiers: 1) DOM Selectors  2) NeoVision  3) AI Vision
// Human click simulation bypasses isTrusted detection.


(function () {
    'use strict';


    // ---- Polyfill for Firefox ----
    const runtime = (typeof browser !== 'undefined' ? browser : chrome).runtime;

    //--- Tier 1 DOM Selectors ----
    const KNOWN_SELECTORS = [
        '.ytp-ad-skip-button-modern',
        '.ytp-skip-ad-button',
        '.ytp-ad-skip-button'
    ];
    
    //Self learning selector cache
    function getLearnedSelector(){
        try{
            return localStorage.getItem('autoAdSkipper_lastSelector');
        }catch(e){
            return null;
        }
    } 


    function setLearnedSelector(selector){
        try{
            localStorage.setItem('autoAdSkipper_lastSelector', selector)
        }catch(e){}
    }

    // ---- Human Clicking Simulation (3 layers) ----
    async function humanClick(element){
        if (!element) return false;


        //Layer 1: Direct Click
        try {element.click();} catch(e){}

        //Layer 2: Full mouse event sequence with coordinates
        try{
            const rect = element.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const eventOptions ={
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: centerX,
                clientY: centerY,
                screenX = window.screenX + centerX,
                screenY = window.screenY + centerY
            };
            const events = [
                new MouseEvent('mouseover', eventOptions),
                new MouseEvent('mousedown', eventOptions),
                new MouseEvent('mouseup', eventOptions),
                new MouseEvent('click', eventOptions)
            ];
            events.forEach(ev => element.dispatchEvent(ev));
        }catch(e){}
        
        // Layer 3 : Injection bypass (trusted click)
        try{
            const injectedFunction = function(selector){
                let target = document.querySelector(selector);
                if (!target){
                    const btns = document.querySelectorAll('button, [role="button"]');
                    target = Array.from(btns).find(btn => {
                        const text = (btn.innerText || btn.getAttribute('aria-label') || '').toLowerCase();
                        
                        return btn.offsetParent !== null & text.includes('skip');
                    });
                }
                if (target) target.click();
            };

            let selector = '';
            if (element.id) selector = "#" + element.id;
            else if (element.className && typeof element.className === "string"){
                selector = element.tagName.toLowerCase() + "." + element.className.split(' ').filter(c => c).join('.');
            }

            const script = document.createElement('script');
            script.textContent = `(${injectedFunction.toString()})(${JSON.stringify(selector)});`;
            document.documentElement.appendChild(script);
            script.remove();
        }catch(e){}
        
        return true;
    }
    
    
    // Tier 2: NeoVision  (DOM text + position)
    function findSkipButtonViaNeo(){
        const player = document.getElementById('movie_player');
        if(!player) return null;

        const clickables = player.querySelectorAll('button, [role="button"], .ytp-button');
        const skipKeywords = ['skip', 'saltar', 'ignorer', 'überspringen', 'passer', 'ignora', 'skip ad'];

        for (const el of clickables){
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            const text = (el.innerText || el.getAttribute('aria-label') || '').toLowerCase();
            if (skipKeywords.some(kw => text.includes(kw))){
                return el;
            }
        }

        // Positional heuristic: bottom-right quadrant of video
        const video = player.querySelector('video');
        if(video){
            const vRect = video.getBoundingClientRect();
            for (const el of clickables){
                const rect = el.getBoundingClientRect();
                if (rect.width < 50 || rect.height < 20) continue;
                const centerX = rect.x + rect.width / 2;
                const cebnterY = rect.y + rect.height / 2;
                if(centerX > vRect.left + vRect.width * 0.6 && centerY > vRect.top + vRect.height * 0.6){
                    const style = window.getComputedStyle(el);
                    if (style.cursor === 'pointer'){
                        return el;
                    }
                }
            }
        }
        return null;
    }
})