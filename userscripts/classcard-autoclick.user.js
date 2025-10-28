// ==UserScript==
// @name         Classcard Match Auto-Clicker
// @namespace    https://classcard.net/
// @version      1.0.0
// @description  자동으로 프롬프트 텍스트를 읽어 두 개의 선택지 중 정답을 찾아 클릭합니다.
// @author       You
// @match        https://www.classcard.net/Match/*
// @match        https://classcard.net/Match/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // ===== 설정 =====
  const PROMPT_SELECTOR = 'div[style*="font-size: 30px"][style*="overflow-wrap: break-word"]';
  const OPTIONS_CONTAINER_SELECTOR = null; // 알면 '.choices', '#answerArea' 등으로 지정
  const INTERVAL_MS = 500; // 시도 주기

  // ===== 유틸 =====
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const norm = (s) => (s || '').toLowerCase().replace(/[\p{Cf}\p{Z}\s]+/gu, ' ').trim();
  const getText = (el) => (el?.textContent || '').trim();

  const isClickable = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') return false;
    if (el.disabled) return false;
    const byStyle = s.cursor === 'pointer';
    const role = (el.getAttribute('role') || '').toLowerCase();
    const byAttr = role === 'button' || role === 'link' || el.hasAttribute('onclick') || (typeof el.tabIndex === 'number' && el.tabIndex >= 0);
    return byStyle || byAttr;
  };

  const findOptionsInContainer = (container) => {
    const nodes = [...container.querySelectorAll('div,button')].filter(isClickable);
    const list = nodes.map(el => ({ el, text: getText(el), n: norm(getText(el)) })).filter(x => x.text);
    if (list.length === 2) return list;
    if (list.length >= 2 && list.length <= 5) return list;
    return list.sort((a, b) => b.text.length - a.text.length).slice(0, 4);
  };

  const autoDetectOptionsNear = (promptEl) => {
    if (promptEl?.parentElement) {
      const list = findOptionsInContainer(promptEl.parentElement);
      if (list.length >= 2) return list;
    }
    let p = promptEl;
    for (let i = 0; i < 4 && p; i++) {
      p = p.parentElement;
      if (!p) break;
      const list = findOptionsInContainer(p);
      if (list.length >= 2) return list;
    }
    const global = [...document.querySelectorAll('div,button')].filter(isClickable);
    const map = new Map();
    for (const el of global) {
      const par = el.parentElement;
      if (!par) continue;
      const arr = map.get(par) || [];
      arr.push(el);
      map.set(par, arr);
    }
    for (const arr of map.values()) {
      const list = arr.map(el => ({ el, text: getText(el), n: norm(getText(el)) })).filter(x => x.text);
      if (list.length === 2) return list;
    }
    return global.map(el => ({ el, text: getText(el), n: norm(getText(el)) })).filter(x => x.text).slice(0, 2);
  };

  const jaccard = (a, b) => {
    const toSet = (s) => new Set(s.split(' ').filter(Boolean));
    const A = toSet(a), B = toSet(b);
    const inter = [...A].filter(x => B.has(x)).length;
    const union = new Set([...A, ...B]).size || 1;
    return inter / union;
  };

  async function chooseAndClickOnce() {
    const promptEl = document.querySelector(PROMPT_SELECTOR);
    if (!promptEl) return false;
    const targetRaw = getText(promptEl);
    const target = norm(targetRaw);
    if (!target) return false;

    let options = [];
    if (OPTIONS_CONTAINER_SELECTOR) {
      const cont = document.querySelector(OPTIONS_CONTAINER_SELECTOR);
      if (!cont) return false;
      options = findOptionsInContainer(cont);
    } else {
      options = autoDetectOptionsNear(promptEl);
    }
    if (!options || options.length < 2) return false;

    let match = options.find(o => o.n === target) || options.find(o => o.n.includes(target) || target.includes(o.n));
    if (!match) {
      let best = null, bestScore = 0;
      for (const o of options) {
        const score = jaccard(o.n, target);
        if (score > bestScore) { bestScore = score; best = o; }
      }
      if (best && bestScore >= 0.5) match = best;
    }
    if (!match) return false;

    match.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    try { match.el.style.outline = '3px solid #2ecc71'; } catch {}
    await sleep(100);
    match.el.click();
    return true;
  }

  // 토글 가능하도록 window에 노출
  const state = { timer: null, running: false };
  const start = () => {
    if (state.running) return;
    state.running = true;
    state.timer = setInterval(() => { chooseAndClickOnce(); }, INTERVAL_MS);
    console.log('[Classcard Auto-Clicker] started');
  };
  const stop = () => {
    if (!state.running) return;
    clearInterval(state.timer);
    state.timer = null;
    state.running = false;
    console.log('[Classcard Auto-Clicker] stopped');
  };

  // 단축키: Alt+M 토글
  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'm' || e.key === 'M')) {
      state.running ? stop() : start();
    }
  }, { passive: true });

  // 자동 시작
  start();

  // 디버그 API
  window.__CLASSCARD_AUTOCLICKER__ = { start, stop, once: chooseAndClickOnce };
})();


