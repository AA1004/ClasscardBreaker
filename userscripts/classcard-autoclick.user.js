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
  // 느슨/엄격 셀렉터 모두 시도
  const PROMPT_SELECTORS = [
    'div[style*="font-size: 30px"][style*="overflow-wrap: break-word"]',
    'div[style*="overflow-wrap: break-word"]',
  ];
  const OPTIONS_CONTAINER_SELECTOR = null; // 알면 '.choices', '#answerArea' 등으로 지정
  const INTERVAL_MS = 800; // 시도 주기 (안정적으로)
  const DEBUG = true;
  // 선택적으로 이중어 사전을 제공하면 정확하게 매칭됩니다.
  // 예) window.__CLASSCARD_AUTOCLICKER__.dict.setPairs([
  //   ['bronze', '청동'], ['flash', '섬광, 번쩍임'], ['look for', '~을 찾다']
  // ]);
  const DICT = {
    e2k: new Map(), // english -> korean
    k2e: new Map(), // korean -> english
  };
  // 새로운 단어 세트
  const DICT_SEED = {
    'adventure': '모험',
    'advertisement': '광고',
    'award': '상',
    'based on': '~을 바탕으로',
    'belief': '신념, 생각',
    'boring': '지루한',
    'check out': '~을 확인하다',
    'connection': '관련성',
    'difference': '차이점',
    'especially': '특히',
    'explain': '설명하다',
    'express': '나타내다, 표현하다',
    'fantasy': '공상',
    'for example': '예를 들면',
    'friendship': '우정',
    'from now on': '지금부터',
    'full of': '~로 가득 찬',
    'hold on': '기다려, 멈춰',
    'lie': '거짓말하다',
    'lift': '들어 올리다',
    'main character': '주인공',
    'make a choice': '선택하다',
    'meal': '식사',
    'mix': '섞다',
    'navy': '남색(의)',
    'opinion': '의견',
    'pocket': '주머니',
    'prove': '증명하다',
    'purple': '보라색, 자색',
    'recommend': '추천하다',
    'right now': '지금',
    'simple': '간단한, 단순한',
    'strongly': '강력하게',
    'touching': '감동적인',
    'traditional': '전통적인',
    'trust': '신뢰하다, 믿다',
    'truth': '진실, 사실',
    'unlike': '~와는 달리',
    'wisely': '현명하게',
    'worth': '가치가 있는'
  };

  // ===== 유틸 =====
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const norm = (s) => (s || '').toLowerCase().replace(/[\p{Cf}\p{Z}\s]+/gu, ' ').trim();
  const getText = (el) => (el?.textContent || '').trim();
  const log = (...args) => { if (DEBUG) console.log('[CC-Auto]', ...args); };
  const hasHangul = (s) => /[\u3131-\u318E\uAC00-\uD7A3]/.test(s || '');

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

  // 화면의 큰 타일 후보를 수집 (가시성/크기 기준)
  const collectBlocks = () => {
    const blocks = [];
    const seen = new Set();
    for (const el of document.querySelectorAll('div')) {
      if (!(el instanceof HTMLElement)) continue;
      const text = getText(el);
      if (!text) continue;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') continue;
      const r = el.getBoundingClientRect();
      if (!r || r.width < 120 || r.height < 40) continue; // 카드가 아닌 작은 요소 제외
      const key = `${Math.round(r.left)}:${Math.round(r.top)}:${Math.round(r.width)}:${Math.round(r.height)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      blocks.push({ el, text, n: norm(text), rect: r, isKo: hasHangul(text) });
    }
    return blocks;
  };

  // font-size, overflow-wrap 실제 적용 값 기반 프롬프트 탐색
  const findPromptElement = () => {
    // 1) 셀렉터 우선
    for (const sel of PROMPT_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    // 2) 스타일 기반
    const candidates = [...document.querySelectorAll('div')];
    for (const el of candidates) {
      const cs = getComputedStyle(el);
      if (cs.fontSize === '30px' && (cs.overflowWrap === 'break-word' || cs.wordWrap === 'break-word')) {
        return el;
      }
    }
    return null;
  };

  const findOptionsInContainer = (container) => {
    const nodes = [...container.querySelectorAll('div,button,a,span')]
      .map(n => {
        // 내부 span 텍스트만 있고 상위가 클릭 가능한 케이스 대응
        let el = n;
        for (let i = 0; i < 3 && el && !isClickable(el); i++) el = el.parentElement;
        return el;
      })
      .filter(Boolean)
      .filter(isClickable);
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

  const isSameNodeOrContains = (a, b) => a === b || a.contains(b) || b.contains(a);

  const pickFarthestHorizontally = (candidates, baseEl) => {
    const baseRect = baseEl.getBoundingClientRect();
    let best = null, bestDx = -1;
    for (const c of candidates) {
      const r = c.el.getBoundingClientRect();
      const dx = Math.abs((r.left + r.right) / 2 - (baseRect.left + baseRect.right) / 2);
      if (dx > bestDx) { bestDx = dx; best = c; }
    }
    return best;
  };

  const pickNearestVertical = (candidates, baseRect) => {
    let best = null, bestDy = Infinity;
    for (const c of candidates) {
      const r = c.rect || c.el.getBoundingClientRect();
      const dy = Math.abs((r.top + r.bottom) / 2 - (baseRect.top + baseRect.bottom) / 2);
      if (dy < bestDy) { bestDy = dy; best = c; }
    }
    return best;
  };

  const centerX = (rect) => (rect.left + rect.right) / 2;
  const computeSplitX = (rects) => {
    const xs = rects.map(r => centerX(r)).sort((a,b) => a-b);
    if (xs.length < 2) return window.innerWidth / 2;
    // 가장 큰 간격을 찾고 그 중간을 분할선으로 사용
    let maxGapIdx = 0, maxGap = -1;
    for (let i = 0; i < xs.length - 1; i++) {
      const gap = xs[i+1] - xs[i];
      if (gap > maxGap) { maxGap = gap; maxGapIdx = i; }
    }
    return (xs[maxGapIdx] + xs[maxGapIdx+1]) / 2;
  };

  // 프롬프트 기반 로직을 완전히 비활성화하고 블록 기반만 사용
  async function chooseAndClickOnce() {
    // 프롬프트 기반 로직을 사용하지 않고 블록 기반만 사용
    return false;
  }

  // 사전 기반: 화면에 동시에 보이는 EN↔KO 쌍을 찾아 클릭 (왼쪽→오른쪽)
  async function clickVisiblePairIfAny() {
    function getClickable(el) {
      let cur = el;
      for (let i = 0; i < 4 && cur; i++) {
        const s = getComputedStyle(cur);
        const clickable = s.cursor === 'pointer' || cur.onclick || cur.getAttribute('role')?.match(/button|link/);
        const visible = s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
        if (clickable && visible) return cur;
        cur = cur.parentElement;
      }
      return el;
    }
    function forceClick(el) {
      try {
        const target = getClickable(el);
        const prev = target.style.pointerEvents;
        const prevZ = target.style.zIndex;
        target.style.pointerEvents = 'auto';
        target.style.zIndex = '9999';
        const rect = target.getBoundingClientRect();
        const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
        ['mouseover','mousemove','mousedown','mouseup','click'].forEach(type => {
          try {
            target.dispatchEvent(new MouseEvent(type, {bubbles:true,cancelable:true,clientX:cx,clientY:cy}));
          } catch (e) {
            // 개별 이벤트 오류 무시
          }
        });
        target.style.pointerEvents = prev;
        target.style.zIndex = prevZ;
      } catch (e) {
        // 전체 클릭 오류 무시
      }
    }

    // 왼쪽 영어-오른쪽 한국어 중 첫 가능한 한 쌍을 찾아 강제 클릭
    const blocks = [...document.querySelectorAll('div')].map(el => {
      const t = (el.textContent||'').trim();
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (!t || s.display==='none' || s.visibility==='hidden' || s.opacity==='0' || r.width<120 || r.height<40) return null;
      return {el,t,isKo:/[가-힣]/.test(t),top:(r.top+r.bottom)/2,cx:(r.left+r.right)/2};
    }).filter(Boolean);
    const lefts = blocks.filter(b => !b.isKo).sort((a,b)=>a.top-b.top);
    const rights = blocks.filter(b => b.isKo);
    
    // 시드 기반 사용
    const map = new Map(Object.entries({
      'adventure':'모험','advertisement':'광고','award':'상','based on':'~을 바탕으로',
      'belief':'신념, 생각','boring':'지루한','check out':'~을 확인하다','connection':'관련성',
      'difference':'차이점','especially':'특히','explain':'설명하다','express':'나타내다, 표현하다',
      'fantasy':'공상','for example':'예를 들면','friendship':'우정','from now on':'지금부터',
      'full of':'~로 가득 찬','hold on':'기다려, 멈춰','lie':'거짓말하다','lift':'들어 올리다',
      'main character':'주인공','make a choice':'선택하다','meal':'식사','mix':'섞다',
      'navy':'남색(의)','opinion':'의견','pocket':'주머니','prove':'증명하다',
      'purple':'보라색, 자색','recommend':'추천하다','right now':'지금','simple':'간단한, 단순한',
      'strongly':'강력하게','touching':'감동적인','traditional':'전통적인','trust':'신뢰하다, 믿다',
      'truth':'진실, 사실','unlike':'~와는 달리','wisely':'현명하게','worth':'가치가 있는'
    }));
    
    for (const e of lefts) {
      const ko = map.get(e.t.trim().toLowerCase());
      if (!ko) continue;
      // 공백/줄바꿈/콤마를 무시하고 비교
      const normKR = (s) => (s || '').toLowerCase().replace(/[\s,·]+/g, '');
      const targetNorm = normKR(ko);
      const candidates = rights.filter(k => normKR(k.t.trim()) === targetNorm);
      if (!candidates.length) continue;
      const k = candidates.sort((a,b)=>Math.abs(a.top-e.top)-Math.abs(b.top-e.top))[0];
      
      // 연속으로 같은 쌍을 클릭하지 않도록 확인
      const pairKey = `${e.t.trim().toLowerCase()}|${k.t.trim()}`;
      if (state.lastClickedPair === pairKey) continue;
      
      // 클릭 전에 요소가 여전히 존재하고 보이는지 확인
      if (!e.el.isConnected || !k.el.isConnected) continue;
      const eRect = e.el.getBoundingClientRect();
      const kRect = k.el.getBoundingClientRect();
      if (eRect.width === 0 || eRect.height === 0 || kRect.width === 0 || kRect.height === 0) continue;
      
      // 마지막 클릭한 쌍을 기록
      state.lastClickedPair = pairKey;
      
      forceClick(e.el);
      forceClick(k.el);
      log('pair clicked:', e.t, '→', k.t);
      return true;
    }
    return false;
  }

  // 토글 가능하도록 window에 노출
  const state = { timer: null, running: false, lastClickedPair: null };
  const start = () => {
    if (state.running) return;
    state.running = true;
    
    // 단어 블록(영/한)이 화면에 나타날 때까지 대기한 뒤 2초 지연 후 시작
    const hasWordBlocks = () => {
      const blocks = [...document.querySelectorAll('div')].map(el => {
        const t = (el.textContent||'').trim();
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        if (!t || s.display==='none' || s.visibility==='hidden' || s.opacity==='0' || r.width<120 || r.height<40) return null;
        return { t, isKo: /[가-힣]/.test(t) };
      }).filter(Boolean);
      const lefts = blocks.filter(b => !b.isKo);
      const rights = blocks.filter(b => b.isKo);
      return lefts.length > 0 && rights.length > 0;
    };
    
    const runLoop = async () => {
      if (!state.running) return;
      
      // 블록 기반 쌍 매칭만 사용 (프롬프트 기반 로직 완전 비활성화)
      const success = await clickVisiblePairIfAny();
      if (success) {
        // 매칭 성공 시 1.4초 대기 후 다음 쌍을 찾기
        await sleep(200);
      } else {
        // 실패 시에도 최소 1초는 대기 (너무 빠른 스캔 방지)
        await sleep(3000);
      }
      
      // 다음 루프 예약
      if (state.running) {
        state.timer = setTimeout(runLoop, 100);
      }
    };
    
    (async () => {
      for (let i = 0; i < 50 && !hasWordBlocks(); i++) {
        await sleep(200);
      }
      if (hasWordBlocks()) await sleep(2000); // 시작 전 2초 대기
      runLoop();
    })();
    console.log('[Classcard Auto-Clicker] started');
  };
  const stop = () => {
    if (!state.running) return;
    state.running = false;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    state.lastClickedPair = null; // 마지막 클릭 기록 초기화
    console.log('[Classcard Auto-Clicker] stopped');
  };

  // 단축키: Alt+M 토글
  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'm' || e.key === 'M')) {
      state.running ? stop() : start();
    }
  }, { passive: true });

  // SPA 네비게이션 대응: DOM 변경 감시 + 자동 시작
  const mo = new MutationObserver(() => {
    if (!state.running) return;
    // 변화 감지 시 즉시 한 번 시도
    clickVisiblePairIfAny();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  // 페이지 로드 시 자동 시작 (상시 모니터링)
  start();

  // 디버그 API
  window.__CLASSCARD_AUTOCLICKER__ = {
    start, stop, once: chooseAndClickOnce,
    dict: {
      clear() { DICT.e2k.clear(); DICT.k2e.clear(); },
      setPairs(pairs) {
        for (const [en, ko] of pairs) {
          const ne = norm(en), nk = norm(ko);
          if (ne) DICT.e2k.set(ne, nk);
          if (nk) DICT.k2e.set(nk, ne);
        }
        log('dict loaded', DICT.e2k.size, DICT.k2e.size);
      },
      sets(object) {
        // { 'bronze': '청동', 'flash': '섬광, 번쩍임' } 형태
        for (const k of Object.keys(object || {})) {
          const ne = norm(k), nk = norm(object[k]);
          if (ne) DICT.e2k.set(ne, nk);
          if (nk) DICT.k2e.set(nk, ne);
        }
        log('dict loaded', DICT.e2k.size, DICT.k2e.size);
      },
      seed() {
        for (const k of Object.keys(DICT_SEED)) {
          const ne = norm(k), nk = norm(DICT_SEED[k]);
          if (ne) DICT.e2k.set(ne, nk);
          if (nk) DICT.k2e.set(nk, ne);
        }
        log('dict seeded', DICT.e2k.size, DICT.k2e.size);
      },
      saveToLocalStorage() {
        try {
          const data = { e2k: Array.from(DICT.e2k.entries()), k2e: Array.from(DICT.k2e.entries()) };
          localStorage.setItem('CC_AUTO_DICT', JSON.stringify(data));
          log('dict saved to localStorage');
        } catch (e) { console.warn(e); }
      },
      loadFromLocalStorage() {
        try {
          const raw = localStorage.getItem('CC_AUTO_DICT');
          if (!raw) return false;
          const data = JSON.parse(raw);
          DICT.e2k.clear(); DICT.k2e.clear();
          for (const [k, v] of (data.e2k || [])) DICT.e2k.set(k, v);
          for (const [k, v] of (data.k2e || [])) DICT.k2e.set(k, v);
          log('dict loaded from localStorage', DICT.e2k.size, DICT.k2e.size);
          return true;
        } catch (e) { console.warn(e); return false; }
      },
      promptLoad() {
        const help = '붙여넣기 형식:\n영어=한국어\n예) bronze=청동\n여러 줄로 붙여넣기 가능';
        const input = window.prompt(help, '');
        if (!input) return false;
        const obj = {};
        for (const line of input.split(/\n+/)) {
          const m = line.split('=');
          if (m.length >= 2) obj[m[0].trim()] = m.slice(1).join('=').trim();
        }
        this.sets(obj);
        this.saveToLocalStorage();
        return true;
      }
    }
  };

  // 자동으로 전역 변수/로컬스토리지에서 사전 로드
  try {
    const injected = (window.__CLASSCARD_DICT__ && typeof window.__CLASSCARD_DICT__ === 'object') ? window.__CLASSCARD_DICT__ : null;
    if (injected) {
      window.__CLASSCARD_AUTOCLICKER__.dict.sets(injected);
      log('dict loaded from window.__CLASSCARD_DICT__');
    } else {
      const ok = window.__CLASSCARD_AUTOCLICKER__.dict.loadFromLocalStorage();
      if (!ok) {
        // 최후수단: 내장 시드 사용
        window.__CLASSCARD_AUTOCLICKER__.dict.seed();
        log('dict fallback to built-in seed');
      }
    }
  } catch {}
})();


