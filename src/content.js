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
})