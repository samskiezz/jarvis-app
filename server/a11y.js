/**
 * ACCESSIBILITY CORE — window.A11Y
 * Stage 5 M0: Engine skeleton + state/apply/init/detectCaps
 *
 * One engine, four entry points (voice/text/chat/agent) → single A11Y.intent dispatch
 * All feature-detected; on-device inference; never fakes data.
 */

window.A11Y = (function(){
  const NS_DEFAULT = 'jv_a11y';
  let state = {};
  let caps = {};
  let opts = { mirror: true, ns: NS_DEFAULT, surface: 'voice' };

  /* ── lifecycle / state ──────────────────────────────── */

  function init(o) {
    try {
      opts = { ...opts, ...o };
      detectCaps();
      loadState();
      migrate();
      buildLayer();
      apply();
      bindInputs();
      if (opts.mirror) startMirror();
    } catch (e) {
      console.error('[A11Y] init failed:', e);
    }
  }

  function detectCaps() {
    caps = {
      speech: !!window.SpeechRecognition || !!window.webkitSpeechRecognition,
      webgpu: !!(navigator.gpu),
      mediapipe: true, // lazy-loaded on demand
      camera: true, // checked at getUserMedia time
      tts: !!(window.speechSynthesis),
      mirror: !!window.fetch,
    };
  }

  function loadState() {
    const ns = opts.ns;
    try {
      const saved = localStorage.getItem(ns);
      state = saved ? JSON.parse(saved) : {};
    } catch (e) {
      state = {};
    }
    // Ensure defaults exist
    state = {
      hc: false,
      contrastAuto: true,
      scale: 100,
      reduceMotion: false,
      voiceCmd: false,
      showLabels: false,
      readAloud: true,
      rate: 0.98,
      pitch: 0.9,
      scan: false,
      scanMode: 'auto',
      scanMs: 1200,
      switchKeys: ['Space', 'Enter'],
      dwell: false,
      dwellMs: 900,
      xlTargets: true,
      targetPx: 64,
      captions: true,
      captionVideo: true,
      calm: false,
      gaze: false,
      gazeEngine: 'mediapipe',
      gazeSensitivity: 1.0,
      gazeSwitch: 'blink',
      predict: true,
      kbd: false,
      _ts: 0,
      _source: 'local',
      ...state,
    };
  }

  function migrate() {
    // Legacy bridge: jv_access → a11y state
    // bigtext → scale, hc → hc, voicecmd → voiceCmd
    const legacy = localStorage.getItem('jv_access');
    if (legacy) {
      try {
        const old = JSON.parse(legacy);
        if (old.bigtext && state.scale === 100) state.scale = 140;
        if (old.hc && !state.hc) state.hc = true;
        if (old.voicecmd && !state.voiceCmd) state.voiceCmd = true;
      } catch (e) {
        // ignore
      }
    }
  }

  function set(key, val, source = 'local') {
    state[key] = val;
    state._ts = Date.now();
    state._source = source;
    persist();
    bridgeLegacy();
    apply();
    if (opts.mirror && (source === 'local' || source === 'voice' || source === 'text')) {
      postMirror({ [key]: val });
    }
  }

  function get(key) {
    return state[key];
  }

  function apply(skipFields = []) {
    // Apply visual modes (D11: skip drag fields)
    if (!skipFields.includes('hc')) {
      document.body.classList.toggle('hc', state.hc || state.contrastAuto);
    }
    if (!skipFields.includes('scale')) {
      document.body.classList.toggle('a11y-scale', state.scale !== 100);
    }
    if (!skipFields.includes('reduceMotion')) {
      document.body.classList.toggle('reduce-motion', state.reduceMotion);
    }
    if (!skipFields.includes('xlTargets')) {
      document.body.classList.toggle('xl-targets', state.xlTargets);
    }
    if (!skipFields.includes('calm')) {
      document.body.classList.toggle('calm', state.calm);
    }

    // CSS custom properties
    document.documentElement.style.setProperty('--a11y-scale', state.scale / 100);
    document.documentElement.style.setProperty('--a11y-target', state.targetPx + 'px');
    document.documentElement.style.setProperty('--a11y-dwell-ms', state.dwellMs + 'ms');
  }

  function reset() {
    state = {
      hc: false,
      contrastAuto: true,
      scale: 100,
      reduceMotion: false,
      voiceCmd: false,
      showLabels: false,
      readAloud: true,
      rate: 0.98,
      pitch: 0.9,
      scan: false,
      scanMode: 'auto',
      scanMs: 1200,
      switchKeys: ['Space', 'Enter'],
      dwell: false,
      dwellMs: 900,
      xlTargets: true,
      targetPx: 64,
      captions: true,
      captionVideo: true,
      calm: false,
      gaze: false,
      gazeEngine: 'mediapipe',
      gazeSensitivity: 1.0,
      gazeSwitch: 'blink',
      predict: true,
      kbd: false,
      _ts: Date.now(),
      _source: 'local',
    };
    persist();
    bridgeLegacy();
    apply();
  }

  function status() {
    return { state, capabilities: caps };
  }

  function unavailable(pillar, reason) {
    const msg = `${pillar} not available: ${reason}`;
    try {
      TTS.speak(msg, { priority: 'barge-in' });
    } catch (e) { }
    try {
      const toast = document.createElement('div');
      toast.className = 'a11y-toast';
      toast.textContent = msg;
      toast.style.cssText = `
        position: fixed; bottom: 80px; left: 16px; right: 16px;
        background: #ff6b6b; color: #fff; padding: 12px 16px;
        border-radius: 4px; z-index: 999999; font-size: 14px;
        font-weight: 500;
      `;
      document.body.appendChild(toast);
      setTimeout(() => { try { toast.remove(); } catch (e) { } }, 4000);
    } catch (e) { }
    console.warn('[A11Y]', msg);
  }

  /* ── The ONE dispatch entry point ──────────────────── */

  function intent(text, source = 'voice') {
    try {
      text = (text || '').toLowerCase();
      // M0: just match high-level accessibility intents; other stages add pillar-specific grammar
      if (/\b(captions?|subtitles?)\b.*\b(on|off)\b/.test(text)) {
        const on = !/off/.test(text);
        set('captions', on, source);
        return { handled: true, reply: `Captions ${on ? 'on' : 'off'}.`, spoke: true };
      }
      if (/\b(high|more)\s+contrast\b/.test(text)) {
        set('hc', true, source);
        return { handled: true, reply: 'High contrast on.', spoke: true };
      }
      if (/\b(bigger|larger)\s+text\b/.test(text)) {
        set('scale', 140, source);
        return { handled: true, reply: 'Larger text.', spoke: true };
      }
      if (/\bsmaller\s+text\b/.test(text)) {
        set('scale', 100, source);
        return { handled: true, reply: 'Smaller text.', spoke: true };
      }
      if (/\b(reduce|less|stop)\s+motion\b/.test(text)) {
        set('reduceMotion', true, source);
        return { handled: true, reply: 'Motion reduced.', spoke: true };
      }
      if (/\b(calm|simple|gentle)\s+mode\b/.test(text)) {
        set('calm', true, source);
        return { handled: true, reply: 'Calm mode on.', spoke: true };
      }
    } catch (e) {
      console.error('[A11Y] intent error:', e);
    }
    return { handled: false };
  }

  /* ── placeholder stubs for M1+ ──────────────────────── */

  const CommandRegistry = { scan: () => {}, byNumber: () => {}, byName: () => {} };
  function showCommands() { }
  function showLabels(on) { }
  function activateByNumber(n) { }
  function resolveByName(p) { }

  /* D5: TTS queue with priority, barge-in, rate/pitch control */
  const TTS = {
    _queue: [],
    _speaking: false,
    _lastRate: 1,
    _lastPitch: 1,

    speak(text, opts = {}) {
      if (!text) return;
      const priority = opts.priority || 'normal'; // emergency|barge-in|normal|background
      const interrupt = opts.interrupt !== false;

      // Interrupt: clear normal+background if emergency/barge-in
      if ((priority === 'emergency' || priority === 'barge-in') && interrupt) {
        this._queue = this._queue.filter(q => q.priority === 'emergency' || q.priority === 'barge-in');
        try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { }
      }

      this._queue.push({ text, priority, ts: Date.now() });
      this._drain();
    },

    stop() {
      this._queue = this._queue.filter(q => q.priority === 'emergency');
      try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { }
      this._speaking = false;
    },

    _drain() {
      if (this._speaking || !this._queue.length) return;
      this._speaking = true;

      const item = this._queue.shift();
      let isDone = false;

      // Force-drain timeout: if speech doesn't finish in 30s, resume queue
      const timeout = setTimeout(() => {
        if (!isDone && this._speaking) {
          console.warn('[A11Y] TTS timeout; forcing drain');
          isDone = true;
          this._speaking = false;
          this._drain();
        }
      }, 30000);

      const clearTimeout_ = () => {
        if (!isDone) {
          clearTimeout(timeout);
          isDone = true;
        }
      };

      const doSpeak = () => {
        try {
          const rate = state.rate || 0.98;
          const pitch = state.pitch || 0.9;

          // Prefer jarvis() if available; fallback to speechSynthesis
          if (typeof jarvis === 'function') {
            Promise.resolve(jarvis(item.text, { rate, pitch }))
              .then(() => { clearTimeout_(); this._speaking = false; this._drain(); })
              .catch((e) => { console.error('[A11Y] jarvis() failed:', e); clearTimeout_(); this._speaking = false; this._drain(); });
            return;
          } else if (typeof jarvisSpeak === 'function') {
            Promise.resolve(jarvisSpeak(item.text))
              .then(() => { clearTimeout_(); this._speaking = false; this._drain(); })
              .catch((e) => { console.error('[A11Y] jarvisSpeak() failed:', e); clearTimeout_(); this._speaking = false; this._drain(); });
            return;
          } else if (window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance(item.text);
            utterance.rate = rate;
            utterance.pitch = pitch;
            utterance.onend = () => { clearTimeout_(); this._speaking = false; this._drain(); };
            utterance.onerror = () => { clearTimeout_(); this._speaking = false; this._drain(); };
            window.speechSynthesis.speak(utterance);
            return;
          }
        } catch (e) {
          console.error('[A11Y] TTS.speak failed:', e);
        }
        clearTimeout_();
        this._speaking = false;
        this._drain();
      };

      doSpeak();
    }
  };

  function readScreen(region) {
    try {
      const el = region ? document.querySelector(region) : document.body;
      if (!el) return;
      const text = el.innerText || el.textContent || '';
      if (text.trim()) {
        TTS.speak(text.trim().substring(0, 1000), { priority: 'barge-in' });
      }
    } catch (e) {
      console.error('[A11Y] readScreen failed:', e);
    }
  }

  function readTasks() {
    try {
      TTS.speak('Reading task list...', { priority: 'barge-in' });
      fetch('/tasks').then(r => r.json()).then(data => {
        if (data && data.length) {
          const list = data.slice(0, 5).map((t, i) => `${i + 1}. ${t.title}`).join('. ');
          TTS.speak(list);
        } else {
          TTS.speak('No tasks found.');
        }
      }).catch(() => {
        unavailable('read tasks', 'server connection failed');
      });
    } catch (e) {
      console.error('[A11Y] readTasks failed:', e);
    }
  }

  function readCaptions() {
    try {
      const bar = document.getElementById('a11y-captions');
      if (bar && bar.textContent.trim()) {
        TTS.speak(bar.textContent, { priority: 'normal' });
      } else {
        TTS.speak('No captions available.');
      }
    } catch (e) {
      console.error('[A11Y] readCaptions failed:', e);
    }
  }

  function readFeed() {
    try {
      TTS.speak('Reading feed...', { priority: 'barge-in' });
      fetch('/feed?limit=3')
        .then(r => r.json())
        .then(data => {
          if (data?.items && data.items.length) {
            const list = data.items.map((item, i) => `${i + 1}. ${item.author || 'Someone'}: ${item.caption || '(no caption)'}`).join('. ');
            TTS.speak(list);
          } else {
            TTS.speak('No feed items yet.');
          }
        })
        .catch(() => {
          unavailable('read feed', 'server unavailable');
        });
    } catch (e) {
      console.error('[A11Y] readFeed failed:', e);
      unavailable('read feed', e.message);
    }
  }

  function readNotifications() {
    try {
      TTS.speak('Reading notifications...', { priority: 'barge-in' });
      fetch('/notifications?limit=5')
        .then(r => r.json())
        .then(data => {
          if (data && data.length) {
            const list = data.map((n, i) => `${i + 1}. ${n.title || 'Notification'}`).join('. ');
            TTS.speak(list);
          } else {
            TTS.speak('No new notifications.');
          }
        })
        .catch(() => {
          unavailable('read notifications', 'server unavailable');
        });
    } catch (e) {
      console.error('[A11Y] readNotifications failed:', e);
      unavailable('read notifications', e.message);
    }
  }

  /* D6: SelectionCore — the ONE primitive voice/scan/dwell/gaze all resolve into */
  const SelectionCore = {
    activate(el) {
      if (!el) return;
      try {
        el.focus({ preventScroll: true });
        el.click();
      } catch (e) {
        console.error('[A11Y] SelectionCore.activate failed:', e);
      }
    }
  };

  const scan = { start: () => {}, stop: () => {}, _step: () => {} };
  const dwell = { enable: () => {}, disable: () => {} };
  const targets = { refresh: () => {} };

  /* D3: caption() — render to caption bar */
  const captionHistory = [];
  const MAX_CAPTIONS = 3;

  function caption(text, who) {
    if (!text || !state.captions) return;
    try {
      captionHistory.push({ text, who, ts: Date.now() });
      if (captionHistory.length > MAX_CAPTIONS) captionHistory.shift();

      const bar = document.getElementById('a11y-captions');
      if (!bar) return;

      bar.textContent = captionHistory.map(c => c.text).join(' | ');
      bar.classList.remove('hidden');

      // Auto-hide after 6s
      clearTimeout(caption._hideTimer);
      caption._hideTimer = setTimeout(() => {
        try { bar.classList.add('hidden'); } catch (e) { }
      }, 6000);
    } catch (e) {
      console.error('[A11Y] caption failed:', e);
    }
  }

  const captions = {
    attachVideo(stream) { },
    on() { state.captions = true; apply(); },
    off() { state.captions = false; apply(); }
  };

  const calm = { enter: () => {}, exit: () => {} };

  const gaze = {
    enable: () => {},
    disable: () => {},
    calibrate: () => {},
    _onLandmarks: () => {}
  };

  const predict = { attach(inputEl) { }, _suggest(prefix) { } };
  const kbd = { show: () => {}, hide: () => {} };

  /* ── mirror sync (D2: full polling + reconcile + execCmd) ──────────────────────────────── */

  let _lastCmdNonce = null;
  let _pollInterval = null;
  let _postMirror_logged = false;
  const A11Y_BASE = (location.pathname.indexOf('/jarvis') === 0) ? '/jarvis' : '';
  const A11Y_URL = path => A11Y_BASE + path;

  function execCmd(cmd) {
    if (!cmd || !cmd.nonce || cmd.nonce === _lastCmdNonce) return;
    _lastCmdNonce = cmd.nonce;
    // NEVER replay a stale persisted command (an hours-old read_screen was re-firing on EVERY page
    // load, barging in over the boot greeting in the wrong voice). Commands are live: >15s old = skip.
    if (cmd.ts && (Date.now() - cmd.ts) > 15000) return;
    try {
      if (cmd.action === 'read_screen') {
        readScreen(cmd.region);
      } else if (cmd.action === 'speak') {
        TTS.speak(cmd.text, { interrupt: true });
      }
    } catch (e) {
      console.error('[A11Y] execCmd failed:', e);
    }
  }

  function postMirror(patch) {
    if (!opts.mirror || !window.fetch || !window.CT) return;
    const payload = JSON.stringify({ state: patch, source: state._source });
    fetch(A11Y_URL(`/a11y?token=${window.CT}`), {
      method: 'POST',
      body: payload,
      headers: { 'Content-Type': 'application/json' }
    }).catch(e => {
      if (!_postMirror_logged) {
        console.error('[A11Y] mirror POST failed:', e);
        _postMirror_logged = true;
      }
    });
  }

  function reconcile(remote) {
    if (!remote || !remote.ts) return;
    if (remote.ts <= state._ts) return; // echo suppression

    // Detect actively dragging fields (don't yank sliders mid-drag)
    const activeDragFields = [];
    try {
      document.querySelectorAll('input[type="range"]:active, [draggable="true"]:active').forEach(el => {
        if (el.name) activeDragFields.push(el.name);
        if (el.id) activeDragFields.push(el.id);
      });
    } catch (e) {
      // ignore
    }

    for (const k of Object.keys(remote.state || {})) {
      if (activeDragFields.some(f => k.includes(f))) continue; // skip dragging fields
      if (k.startsWith('_')) continue; // skip internal fields
      state[k] = remote.state[k];
    }
    state._ts = remote.ts;
    persist();
    apply();
    execCmd(remote._cmd);
  }

  function startMirror() {
    if (!opts.mirror) return;
    let pollFails = 0;
    let pollInterval = 4000;
    let _spoken = {};

    const poll = async () => {
      try {
        const response = await fetch(A11Y_URL('/a11y'));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const remote = await response.json();
        if (remote && remote.ts) {
          if (pollFails > 0) {
            pollFails = 0;
            pollInterval = 4000;
            _spoken = {};
          }
          reconcile(remote);
        } else {
          pollFails++;
        }
      } catch (e) {
        pollFails++;
      }

      // Feedback: speak once per milestone
      if (pollFails === 2 && !_spoken['conn']) {
        TTS.speak('Connection problem.', { priority: 'normal' });
        _spoken['conn'] = true;
      }
      if (pollFails === 3 && !_spoken['lost']) {
        TTS.speak('Sync lost.', { priority: 'normal' });
        _spoken['lost'] = true;
      }

      if (pollFails > 10) {
        clearInterval(_pollInterval);
        if (!_spoken['stop']) {
          TTS.speak('Stopped syncing.', { priority: 'normal' });
          _spoken['stop'] = true;
        }
        return;
      }

      // Exponential backoff: 4s → 10s → 30s → 120s
      if (pollFails > 3) {
        pollInterval = Math.min(120000, 4000 * Math.pow(1.5, pollFails - 3));
      }
      clearInterval(_pollInterval);
      _pollInterval = setInterval(poll, pollInterval);
    };

    _pollInterval = setInterval(poll, pollInterval);
  }

  /* ── helpers ──────────────────────────────────────────── */

  function persist() {
    try {
      localStorage.setItem(opts.ns, JSON.stringify(state));
    } catch (e) {
      console.error('[A11Y] persist failed:', e);
    }
  }

  function bridgeLegacy() {
    // Mirror back to jv_access so existing voice-page chips don't regress
    try {
      localStorage.setItem('jv_access', JSON.stringify({
        bigtext: state.scale >= 140,
        hc: state.hc,
        voicecmd: state.voiceCmd,
      }));
    } catch (e) {
      console.error('[A11Y] bridgeLegacy failed:', e);
    }
  }

  function buildLayer() {
    const existing = document.getElementById('a11y-layer');
    if (!existing) {
      const layer = document.createElement('div');
      layer.id = 'a11y-layer';
      document.body.appendChild(layer);
    }

    // Create caption bar with proper ARIA attributes (not CSS properties)
    const captionBar = document.getElementById('a11y-captions');
    if (!captionBar) {
      const bar = document.createElement('div');
      bar.id = 'a11y-captions';
      bar.setAttribute('aria-live', 'polite');
      bar.setAttribute('aria-atomic', 'true');
      bar.className = 'hidden';
      document.body.appendChild(bar);
    }
  }

  function bindInputs() {
    // M6+ will attach predictive text; M0 is just a hook
  }

  /* ── public API ──────────────────────────────────────── */

  return {
    init,
    set,
    get,
    apply,
    reset,
    status,
    unavailable,
    intent,
    showCommands,
    showLabels,
    activateByNumber,
    resolveByName,
    speak: (t, o) => TTS.speak(t, o || {}),
    stopSpeaking: () => TTS.stop(),
    readScreen,
    readTasks,
    readCaptions,
    readFeed,
    readNotifications,
    SelectionCore,
    scan,
    dwell,
    targets,
    caption,
    captions,
    calm,
    gaze,
    predict,
    kbd,
    get state() { return state; },
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  try {
    A11Y.init(window.__A11Y_OPTS__ || {});
  } catch (e) {
    console.error('[A11Y] failed to init:', e);
  }
});
