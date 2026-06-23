const STORAGE_KEY = 'jarvisOverlayConfig';
const DEFAULT_BASE = 'https://app.projectsolar.cloud/jarvis';

async function loadConfig() {
  const input = document.getElementById('baseUrl');
  try {
    const stored = await chrome.storage.sync.get(STORAGE_KEY);
    input.value = (stored[STORAGE_KEY] && stored[STORAGE_KEY].baseUrl) || DEFAULT_BASE;
  } catch (e) {
    input.value = DEFAULT_BASE;
  }
}

async function saveConfig() {
  const input = document.getElementById('baseUrl');
  const status = document.getElementById('status');
  let url = input.value.trim();
  if (!url) url = DEFAULT_BASE;
  url = url.replace(/\/$/, '');

  try {
    await chrome.storage.sync.set({ [STORAGE_KEY]: { baseUrl: url } });
    status.textContent = 'Saved. Reload the FIFA+ page to apply.';

    // Try to refresh the overlay in the active FIFA+ tab.
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id && tab.url && /fifa/.test(tab.url)) {
      chrome.tabs.sendMessage(tab.id, { action: 'refresh' }).catch(() => {
        // content script may not be loaded; ignore
      });
    }
  } catch (e) {
    status.textContent = 'Error: ' + e.message;
    status.style.color = '#ff8a8a';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  document.getElementById('save').addEventListener('click', saveConfig);
});
