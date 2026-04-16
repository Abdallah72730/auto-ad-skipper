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
})