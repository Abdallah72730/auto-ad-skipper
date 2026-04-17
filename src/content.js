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



    // ---- Tier 3: Ai Vision (ONXX Model) -----
    let ortSession = null;
    let ortLib = null;

    async function initONXX(){
        if (ortSession) return;
        //ort is global if loaded via manifest content_scripts
        ortLib = (typeof ort !== 'undefined') ? ort : (await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.0/dist/esm/ort.min.js')).default;
        const modelUrl = runtime.getURL('src/model/yolov8n.onnx');
        console.log('AI Detector: Loading model from ', modelUrl);
        ortSession = await ortLib.InferenceSession.create(modelUrl, {"executionProviders": ['wasm']});
        console.log('AI detector: Model loaded.');
    }

    async function preprocessYOLO(canvas, targetSize){
        const resized = document.createElement('canvas');
        resized.width = targetSize;
        resized.height = targetSize;
        const rCtx = resized.getContext('2d');
        rCtx.drawImage(canvas, 0, 0, targetSize, targetSize);
        const imageData = rCtx.getImageData(0, 0, targetSize, targetSize);
        const data = imageData.data;
        const inputArray = new Float32Array(1 * 3 * targetSize * targetSize);
        const pixelsPerChannel = targetSize * targetSize;
        
        for(let i = 0; i < data.length; i+= 4){
            const pixelIdx = i / 4;
            const r = data[i] / 255.0;
            const g = data[i+1] / 255.0;
            const b = data[i + 2] / 255.0;
            
            inputArray[pixelIdx] = r;
            inputArray[pixelsPerChannel + pixelIdx] = g;
            inputArray[2 * pixelsPerChannel + pixelIdx] = b;
        }
        return new ortLib.Tensor('float32', inputArray, [1, 3, targetSize, targetSize]);
    }


    async function postprocessYOLO(outputTensor, imgWidth, imgHeight, confThreshold =0.5){
        const data = outputTensor.data;
        const [batch, numChannels, numAnchors] = outputTensor.dims;
        const numClasses = numChannels - 4;
        const boxes = [];
        for (let i = 0; i < numAnchors; i++){
            let maxConf = 0;
            let classId = -1;
            for (let c = 0; c < numClasses; c++){
                const conf = data[i * numChannels + 4 + c];
                if (conf > maxConf){
                    maxConf = conf;
                    classId = c;
                }
            }
            if(maxConf < confThreshold ) continue;
            const cx = data[i * numChannels + 0];
            const cy = data[i * numChannels + 1];
            const w = data[i * numChannels + 2];
            const h = data[i * numChannels + 3];
            boxes.push({x:cx, y:cy, width: w, height: h, confidence: maxConf, class: classId});
        }
        return boxes;
    }

    async function findSkipButtonViaAI() {

        try {
            await initONNX();
        } catch (e) {
            console.error('AI Detector: Failed to load model', e);
            return null;
        }

        const video = document.querySelector('#movie_player video');
        if (!video || video.videoWidth === 0) return null;

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const inputTensor = await preprocessYOLO(canvas, 640);
        const feeds = { 'images': inputTensor };
        const results = await ortSession.run(feeds);
        const output = results['output0'];
        const boxes = postprocessYOLO(output, canvas.width, canvas.height, 0.5);

        const videoRect = video.getBoundingClientRect();
        let bestBox = null;
        let bestScore = 0;

        for (const box of boxes) {
            if (box.confidence > 0.6) {
                const centerX = videoRect.left + box.x * videoRect.width;
                const centerY = videoRect.top + box.y * videoRect.height;
                // Favor bottom-right quadrant (where skip button usually is)
                const quadrantScore = (centerX > videoRect.left + videoRect.width * 0.6 &&
                                       centerY > videoRect.top + videoRect.height * 0.6) ? 1.5 : 1.0;
                const totalScore = box.confidence * quadrantScore;
                if (totalScore > bestScore) {
                    bestScore = totalScore;
                    bestBox = { x: centerX, y: centerY };
                }
            }
        }

        if (bestBox) {
            const element = document.elementFromPoint(bestBox.x, bestBox.y);
            if (element) {
                console.log('AI Detector: Found skip button at', bestBox);
                return element;
            }
        }
        return null;
    }




    // ------ Main Orchestrator -------
    let checkScheduled = false;
    let lastTimeChecked = 0;
    const CHECK_COOLDOWN_MS = 500;

    async function trySkipButton(){
        const player = document.getElementById('movie_player');
        if (!player) return false;

        // ==== Tier 1: Selectors ====
        const learned = getLearnedSelector();
        const selectorsToTry = learned ? [learned, ...KNOWN_SELECTORS] : KNOWN_SELECTORS ;
        for (const selector of selectorsToTry){
            try{
                const button = player.querySelector(selector);
                if(button && button.offsetParent !== null && !button.disabled){
                    await humanClick(button);
                    console.log(`Auto Ad Skipper: Skipped via selector "${selector}"`);
                    setLearnedSelector(selector);
                    return true;
                }
            }catch(e){}
        }

        // === Tier 2: NeoVision ====
        try{
            const neoButton = findSkipButtonViaNeo();
            if(neoButton){
                await humanClick(neoButton);
                console.log("Auto Ad Skipper: Skipped via NeoVision");
                if(neoButton.id) setLearnedSelector("#" + neoButton.id );
                else if (neoButton.classList.length){
                    setLearnedSelector("." + Array.from(neoButton.classList).join('.'));
                }
                return true;
            }
        }catch(e){
            console.warn("Auto Ad Skipper: NeoVision error", e);
        }


        function scheduleCheck() {
            if (checkScheduled) return;
            checkScheduled = true;
            requestAnimationFrame(() => {
                const now = performance.now();
                if (now - lastCheckTime >= CHECK_COOLDOWN_MS) {
                    lastCheckTime = now;
                    tryClickSkipButton().finally(() => { checkScheduled = false; });
                } else {
                    checkScheduled = false;
                }
            });
        }

        function startObserver() {
            const player = document.getElementById('movie_player');
            if (!player) {
                setTimeout(startObserver, 1000);
                return;
            }
            const adContainers = [
                player.querySelector('.ytp-ad-module'),
                player.querySelector('.ytp-ad-player-overlay'),
                player.querySelector('.ytp-ad-image-overlay'),
                player
            ].filter(Boolean);

            const observer = new MutationObserver((mutations) => {
                for (const mut of mutations) {
                    if (mut.addedNodes.length > 0) {
                        scheduleCheck();
                        break;
                    }
                }
            });
        }
    }
})