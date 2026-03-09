/**
 * Background Service Worker
 * Handles side panel, storage, cross-context messaging, sitemap crawling,
 * page fetching, scheduled analysis, and multi-store tracking
 */

// Open side panel when action is clicked (right-click context)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});

// Handle messages from popup and sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SIDEPANEL') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.sidePanel.open({ tabId: tabs[0].id }).catch(err => {
          console.error('Failed to open side panel:', err);
        });
      }
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'SAVE_REPORT') {
    saveReport(message.report).then(entry => {
      // Set badge with score
      const score = message.report.overallScore;
      const color = score >= 90 ? '#22c55e' : score >= 70 ? '#eab308' : score >= 50 ? '#f97316' : '#ef4444';
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.action.setBadgeText({ text: String(score), tabId: tabs[0].id });
          chrome.action.setBadgeBackgroundColor({ color, tabId: tabs[0].id });
        }
      });
      sendResponse({ ok: true, entry });
    }).catch(err => {
      sendResponse({ error: err.message });
    });
    return true;
  }

  if (message.type === 'GET_HISTORY') {
    getHistory(message.domain).then(history => {
      sendResponse({ history });
    }).catch(err => {
      sendResponse({ error: err.message, history: [] });
    });
    return true;
  }

  if (message.type === 'CLEAR_HISTORY') {
    chrome.storage.local.get('seo_history', (data) => {
      const allHistory = data.seo_history || {};
      if (message.domain) {
        delete allHistory[message.domain];
      } else {
        Object.keys(allHistory).forEach(k => delete allHistory[k]);
      }
      chrome.storage.local.set({ seo_history: allHistory }, () => {
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  if (message.type === 'EXPORT_CSV') {
    const csv = generateCSV(message.issues);
    sendResponse({ csv });
    return true;
  }

  // ============================================================
  // NEW: Fetch a page's HTML (for crawler & competitor analysis)
  // ============================================================
  if (message.type === 'FETCH_PAGE') {
    fetch(message.url, {
      mode: 'cors',
      headers: { 'Accept': 'text/html' },
      signal: AbortSignal.timeout(15000)
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(html => sendResponse({ html }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  // ============================================================
  // NEW: Crawl sitemap.xml to discover all URLs
  // ============================================================
  if (message.type === 'CRAWL_SITEMAP') {
    const baseUrl = message.baseUrl;
    const sitemapUrls = [
      `${baseUrl}/sitemap.xml`,
      `${baseUrl}/sitemap_index.xml`
    ];
    crawlSitemaps(sitemapUrls)
      .then(urls => sendResponse({ urls }))
      .catch(err => sendResponse({ error: err.message, urls: [] }));
    return true;
  }

  // ============================================================
  // NEW: Get all tracked domains (multi-store dashboard)
  // ============================================================
  if (message.type === 'GET_ALL_DOMAINS') {
    chrome.storage.local.get('seo_history', (data) => {
      const allHistory = data.seo_history || {};
      const domains = Object.keys(allHistory).map(domain => {
        const entries = allHistory[domain] || [];
        return {
          domain,
          lastScore: entries[0]?.overallScore || 0,
          lastAnalyzed: entries[0]?.timestamp || 0,
          totalAnalyses: entries.length,
          isShopify: entries[0]?.isShopify || false,
          trend: entries.length >= 2
            ? entries[0].overallScore - entries[Math.min(4, entries.length - 1)].overallScore
            : 0
        };
      });
      domains.sort((a, b) => b.lastAnalyzed - a.lastAnalyzed);
      sendResponse({ domains });
    });
    return true;
  }

  // ============================================================
  // NEW: Schedule periodic re-analysis
  // ============================================================
  if (message.type === 'SCHEDULE_ANALYSIS') {
    if (message.enabled) {
      chrome.alarms.create('seo-recheck', {
        periodInMinutes: message.intervalMinutes || 60
      });
      chrome.storage.local.set({
        scheduledAnalysis: { enabled: true, intervalMinutes: message.intervalMinutes || 60 }
      });
    } else {
      chrome.alarms.clear('seo-recheck');
      chrome.storage.local.set({ scheduledAnalysis: { enabled: false } });
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'GET_SCHEDULE') {
    chrome.storage.local.get('scheduledAnalysis', (data) => {
      sendResponse(data.scheduledAnalysis || { enabled: false });
    });
    return true;
  }
});

// ============================================================
// Sitemap crawler
// ============================================================
async function crawlSitemaps(sitemapUrls) {
  const allUrls = new Set();

  for (const sitemapUrl of sitemapUrls) {
    try {
      const res = await fetch(sitemapUrl, {
        headers: { 'Accept': 'text/xml, application/xml' },
        signal: AbortSignal.timeout(10000)
      });
      if (!res.ok) continue;
      const text = await res.text();

      const locRegex = /<loc>\s*(.*?)\s*<\/loc>/gi;
      let match;
      while ((match = locRegex.exec(text)) !== null) {
        const url = match[1].trim();
        if (url.endsWith('.xml') || url.endsWith('.xml.gz')) {
          // Sub-sitemap — recurse one level deep
          try {
            const subRes = await fetch(url, {
              headers: { 'Accept': 'text/xml, application/xml' },
              signal: AbortSignal.timeout(10000)
            });
            if (subRes.ok) {
              const subText = await subRes.text();
              const subRegex = /<loc>\s*(.*?)\s*<\/loc>/gi;
              let subMatch;
              while ((subMatch = subRegex.exec(subText)) !== null) {
                const subUrl = subMatch[1].trim();
                if (!subUrl.endsWith('.xml') && !subUrl.endsWith('.xml.gz')) {
                  allUrls.add(subUrl);
                }
              }
            }
          } catch {}
        } else {
          allUrls.add(url);
        }
      }
    } catch {}
  }

  return Array.from(allUrls).slice(0, 500);
}

// ============================================================
// Scheduled analysis via chrome.alarms
// ============================================================
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'seo-recheck') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url && tabs[0].url.startsWith('http')) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'ANALYZE_PAGE' }, (response) => {
          if (chrome.runtime.lastError) return;
          if (response && !response.error) {
            saveReport(response);
            const score = response.overallScore;
            const color = score >= 90 ? '#22c55e' : score >= 70 ? '#eab308' : score >= 50 ? '#f97316' : '#ef4444';
            chrome.action.setBadgeText({ text: String(score), tabId: tabs[0].id });
            chrome.action.setBadgeBackgroundColor({ color, tabId: tabs[0].id });
          }
        });
      }
    });
  }
});

// ============================================================
// Storage helpers
// ============================================================
async function saveReport(report) {
  return new Promise((resolve, reject) => {
    const domain = new URL(report.url).hostname;
    chrome.storage.local.get('seo_history', (data) => {
      const allHistory = data.seo_history || {};
      if (!allHistory[domain]) allHistory[domain] = [];

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
      allHistory[domain] = allHistory[domain].slice(0, 100);

      chrome.storage.local.set({ seo_history: allHistory }, () => {
        resolve(entry);
      });
    });
  });
}

async function getHistory(domain) {
  return new Promise((resolve) => {
    chrome.storage.local.get('seo_history', (data) => {
      const allHistory = data.seo_history || {};
      resolve(allHistory[domain] || []);
    });
  });
}

function generateCSV(issues) {
  const headers = ['Severity', 'Category', 'Title', 'Description', 'Recommendation', 'Code Snippet'];
  const rows = issues
    .filter(i => i.severity !== 'pass')
    .map(i => [
      i.severity,
      i.category,
      `"${(i.title || '').replace(/"/g, '""')}"`,
      `"${(i.description || '').replace(/"/g, '""')}"`,
      `"${(i.recommendation || '').replace(/"/g, '""')}"`,
      `"${(i.codeSnippet || '').replace(/"/g, '""').replace(/\n/g, '\\n')}"`
    ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

// ============================================================
// Install handler
// ============================================================
chrome.runtime.onInstalled.addListener(() => {
  console.log('ShopifySEO Pro v2.0 installed');
});
