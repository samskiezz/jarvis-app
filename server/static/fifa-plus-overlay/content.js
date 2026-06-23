/*
 * JARVIS WC2026 FIFA+ Overlay
 *
 * This content script runs on FIFA+ pages. It draws a small, draggable panel
 * over the video player showing JARVIS predictions for the selected WC2026
 * fixture. It does NOT download, scrape, or otherwise touch the FIFA+ video
 * stream — it only renders HTML on top of the page you are already watching.
 */

(function () {
  'use strict';

  const DEFAULT_BASE = 'https://app.projectsolar.cloud/jarvis';
  const STORAGE_KEY = 'jarvisOverlayConfig';
  const OVERLAY_ID = 'jarvis-wc2026-overlay';

  // Small helper to read the user's configured server base URL.
  async function getBaseUrl() {
    try {
      const stored = await chrome.storage.sync.get(STORAGE_KEY);
      if (stored && stored[STORAGE_KEY] && stored[STORAGE_KEY].baseUrl) {
        return stored[STORAGE_KEY].baseUrl.replace(/\/$/, '');
      }
    } catch (e) {
      console.warn('[JARVIS overlay] storage read failed:', e);
    }
    return DEFAULT_BASE;
  }

  async function fetchPredictions(baseUrl) {
    const urls = [
      `${baseUrl}/data/wc2026_model_predictions.json`,
      `${baseUrl}/predictions/data/wc2026_model_predictions.json`,
      `${baseUrl}/wc2026_model_predictions.json`,
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) return await res.json();
      } catch (e) {
        // try next fallback
      }
    }
    return null;
  }

  async function fetchTracking(baseUrl) {
    try {
      const res = await fetch(`${baseUrl}/data/wc2026_tracking_features.json`, { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (e) {
      // ignore
    }
    return null;
  }

  function createOverlay() {
    if (document.getElementById(OVERLAY_ID)) return document.getElementById(OVERLAY_ID);

    const el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.innerHTML = `
      <div class="jarvis-header">
        <span class="jarvis-title">⚽ JARVIS WC2026</span>
        <span class="jarvis-close" title="Hide">×</span>
      </div>
      <div class="jarvis-body">
        <div class="jarvis-loading">Loading predictions…</div>
      </div>
      <div class="jarvis-footer">
        <select class="jarvis-fixture-select"></select>
      </div>
    `;
    document.body.appendChild(el);

    // Close button
    el.querySelector('.jarvis-close').addEventListener('click', () => {
      el.style.display = 'none';
    });

    // Dragging
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;
    const header = el.querySelector('.jarvis-header');
    header.addEventListener('mousedown', (e) => {
      dragging = true;
      const rect = el.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      el.style.transition = 'none';
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      el.style.left = `${e.clientX - offsetX}px`;
      el.style.top = `${e.clientY - offsetY}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      el.style.transition = '';
    });

    return el;
  }

  function formatProb(p) {
    if (p === undefined || p === null) return '—';
    return `${(p * 100).toFixed(1)}%`;
  }

  function renderMatch(match, tracking) {
    const pred = match.md2_predictions || {};
    const pick = pred.pick || '—';
    const conf = pred.confidence || 0;
    const spreads = match.spreads || [];
    const homeOdds = match.odds && match.odds.home ? match.odds.home.toFixed(2) : '—';
    const drawOdds = match.odds && match.odds.draw ? match.odds.draw.toFixed(2) : '—';
    const awayOdds = match.odds && match.odds.away ? match.odds.away.toFixed(2) : '—';

    let trackingHtml = '';
    if (tracking && tracking.matches) {
      const sigHome = tracking.matches[match.home] || {};
      const sigAway = tracking.matches[match.away] || {};
      if (sigHome.matches || sigAway.matches) {
        trackingHtml = `
          <div class="jarvis-section">Vision tracking (last ${Math.max(sigHome.matches || 0, sigAway.matches || 0)} matches)</div>
          <div class="jarvis-row"><span>${match.home} avg possession</span><b>${(sigHome.avg_possession * 100 || 0).toFixed(1)}%</b></div>
          <div class="jarvis-row"><span>${match.away} avg possession</span><b>${(sigAway.avg_possession * 100 || 0).toFixed(1)}%</b></div>
        `;
      }
    }

    let spreadsHtml = '';
    if (spreads.length) {
      spreadsHtml = `<div class="jarvis-section">Three-spread value</div>` + spreads.map((s) => {
        const outcome = s.outcome || s.pick || '—';
        const edge = s.edge !== undefined ? `+${(s.edge * 100).toFixed(1)}% edge` : '';
        return `<div class="jarvis-row"><span>${outcome}</span><b>${edge}</b></div>`;
      }).join('');
    }

    return `
      <div class="jarvis-section">Match prediction</div>
      <div class="jarvis-row"><span>${match.home}</span><b>${formatProb(pred.home)}</b></div>
      <div class="jarvis-row"><span>Draw</span><b>${formatProb(pred.draw)}</b></div>
      <div class="jarvis-row"><span>${match.away}</span><b>${formatProb(pred.away)}</b></div>
      <div class="jarvis-row jarvis-pick"><span>Top pick</span><b>${pick} (${formatProb(conf)})</b></div>
      ${spreadsHtml}
      <div class="jarvis-section">Model odds</div>
      <div class="jarvis-row"><span>H / D / A</span><b>${homeOdds} / ${drawOdds} / ${awayOdds}</b></div>
      ${trackingHtml}
      <div class="jarvis-timestamp">Updated ${match.date || '—'}</div>
    `;
  }

  async function refreshOverlay() {
    const el = createOverlay();
    const body = el.querySelector('.jarvis-body');
    const select = el.querySelector('.jarvis-fixture-select');
    body.innerHTML = '<div class="jarvis-loading">Loading predictions…</div>';

    const baseUrl = await getBaseUrl();
    const [predictions, tracking] = await Promise.all([
      fetchPredictions(baseUrl),
      fetchTracking(baseUrl),
    ]);

    if (!predictions || !predictions.matches || !predictions.matches.length) {
      body.innerHTML = '<div class="jarvis-error">No predictions available.<br>Check server URL in extension popup.</div>';
      return;
    }

    // Populate selector
    const currentValue = select.value;
    select.innerHTML = '';
    predictions.matches.forEach((m, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = `${m.home} vs ${m.away}`;
      select.appendChild(opt);
    });
    if (currentValue && currentValue < predictions.matches.length) {
      select.value = currentValue;
    }

    const selected = predictions.matches[parseInt(select.value, 10) || 0];
    body.innerHTML = renderMatch(selected, tracking);

    select.onchange = () => {
      const idx = parseInt(select.value, 10) || 0;
      body.innerHTML = renderMatch(predictions.matches[idx], tracking);
    };
  }

  // Respond to popup refresh requests.
  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message && message.action === 'refresh') {
        refreshOverlay();
        sendResponse({ ok: true });
      }
      return true;
    });
  } catch (e) {
    // ignore if runtime messaging unavailable
  }

  // Run when the page is ready, and re-run on SPA navigation changes.
  function init() {
    if (!location.hostname.includes('fifa')) return;
    refreshOverlay();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-inject if URL changes (FIFA+ is a SPA).
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(init, 1500);
    }
  }).observe(document, { subtree: true, childList: true });
})();
