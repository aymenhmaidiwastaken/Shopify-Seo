/**
 * Storage service for history tracking and settings
 */

const STORAGE_KEY_HISTORY = 'seo_history';
const STORAGE_KEY_SETTINGS = 'seo_settings';
const MAX_HISTORY_ENTRIES = 100;
const MAX_AGE_DAYS = 90;

export const defaultSettings = {
  autoAnalyze: false,
  darkMode: false,
  enabledCategories: ['meta', 'content', 'technical', 'images', 'links', 'performance', 'shopify']
};

export async function getHistory(domain) {
  const data = await chrome.storage.local.get(STORAGE_KEY_HISTORY);
  const allHistory = data[STORAGE_KEY_HISTORY] || {};
  return allHistory[domain] || [];
}

export async function saveReport(report) {
  const domain = new URL(report.url).hostname;
  const data = await chrome.storage.local.get(STORAGE_KEY_HISTORY);
  const allHistory = data[STORAGE_KEY_HISTORY] || {};

  if (!allHistory[domain]) {
    allHistory[domain] = [];
  }

  const entry = {
    url: report.url,
    timestamp: Date.now(),
    overallScore: report.overallScore,
    categoryScores: report.categoryScores,
    issueCount: report.issueCount,
    isShopify: report.isShopify,
    pageType: report.pageType
  };

  allHistory[domain].unshift(entry);

  // Prune old entries
  const cutoff = Date.now() - (MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  allHistory[domain] = allHistory[domain]
    .filter(e => e.timestamp > cutoff)
    .slice(0, MAX_HISTORY_ENTRIES);

  await chrome.storage.local.set({ [STORAGE_KEY_HISTORY]: allHistory });
  return entry;
}

export async function getSettings() {
  const data = await chrome.storage.local.get(STORAGE_KEY_SETTINGS);
  return { ...defaultSettings, ...(data[STORAGE_KEY_SETTINGS] || {}) };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: settings });
}

export async function clearHistory(domain) {
  if (domain) {
    const data = await chrome.storage.local.get(STORAGE_KEY_HISTORY);
    const allHistory = data[STORAGE_KEY_HISTORY] || {};
    delete allHistory[domain];
    await chrome.storage.local.set({ [STORAGE_KEY_HISTORY]: allHistory });
  } else {
    await chrome.storage.local.set({ [STORAGE_KEY_HISTORY]: {} });
  }
}
