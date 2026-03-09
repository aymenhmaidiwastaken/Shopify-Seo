/**
 * Side Panel Script
 * Full detailed SEO analysis dashboard
 */

const CATEGORY_LABELS = {
  meta: 'Meta & Social',
  content: 'Content',
  technical: 'Technical',
  images: 'Images',
  links: 'Links',
  performance: 'Performance',
  shopify: 'Shopify'
};

let analysisResult = null;
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initFilters();
  loadAnalysis();

  document.getElementById('spRefreshBtn').addEventListener('click', runAnalysis);
  document.getElementById('spAnalyzeBtn')?.addEventListener('click', runAnalysis);
  document.getElementById('spExportBtn').addEventListener('click', exportCSV);
  document.getElementById('spPdfBtn').addEventListener('click', exportPDF);
  document.getElementById('clearHistoryBtn')?.addEventListener('click', clearHistory);
  document.getElementById('startCrawlBtn')?.addEventListener('click', startCrawl);
  document.getElementById('compareBtn')?.addEventListener('click', startCompare);
  document.getElementById('rankCheckBtn')?.addEventListener('click', checkRank);
  document.getElementById('rankKeyword')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') checkRank();
  });
});

// ===== TABS =====
function initTabs() {
  document.querySelectorAll('.sp-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sp-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.sp-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById(`panel-${tab.dataset.tab}`);
      if (panel) panel.classList.add('active');

      // Load data for specific tabs when opened
      if (tab.dataset.tab === 'history') loadHistory();
      if (tab.dataset.tab === 'linkmap' && analysisResult) renderLinkMap(analysisResult.data?.links || {});
      if (tab.dataset.tab === 'rank') loadRankHistory();
    });
  });
}

function initFilters() {
  document.querySelectorAll('.sp-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sp-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      if (analysisResult) renderAllIssues(analysisResult.issues);
    });
  });
}

// ===== MESSAGE HELPERS =====
function sendMessage(msg) {
  return new Promise(resolve => chrome.runtime.sendMessage(msg, resolve));
}

function sendMessageToTab(msg) {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, msg, resolve);
      else resolve({ error: 'No active tab' });
    });
  });
}

// ===== LOADING / ANALYSIS =====
function loadAnalysis() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      showNoData();
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_CACHED_RESULT' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        showNoData();
        return;
      }
      displayResults(response);
    });
  });
}

function runAnalysis() {
  showLoading();
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      showNoData();
      return;
    }
    chrome.tabs.sendMessage(tabs[0].id, { type: 'ANALYZE_PAGE' }, (response) => {
      if (chrome.runtime.lastError || !response || response.error) {
        showNoData();
        return;
      }
      displayResults(response);
      chrome.runtime.sendMessage({ type: 'SAVE_REPORT', report: response });
    });
  });
}

function showLoading() {
  document.getElementById('spLoading').style.display = 'flex';
  document.getElementById('spNoData').style.display = 'none';
  document.getElementById('spContent').style.display = 'none';
}

function showNoData() {
  document.getElementById('spLoading').style.display = 'none';
  document.getElementById('spNoData').style.display = 'flex';
  document.getElementById('spContent').style.display = 'none';
}

// ===== UTILITIES =====
function getScoreColor(score) {
  if (score >= 90) return '#22c55e';
  if (score >= 70) return '#eab308';
  if (score >= 50) return '#f97316';
  return '#ef4444';
}

function getGrade(score) {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'B+';
  if (score >= 80) return 'B';
  if (score >= 75) return 'C+';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showToast(message) {
  const toast = document.getElementById('spToast');
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2000);
}

// ===== DISPLAY RESULTS =====
function displayResults(result) {
  analysisResult = result;

  document.getElementById('spLoading').style.display = 'none';
  document.getElementById('spNoData').style.display = 'none';
  document.getElementById('spContent').style.display = 'block';

  // Hide Shopify tab if not Shopify
  const shopifyTab = document.querySelector('.sp-tab[data-tab="shopify"]');
  if (!result.isShopify) {
    shopifyTab.style.display = 'none';
    document.getElementById('shopifyNotDetected').style.display = 'block';
    document.getElementById('shopifyContent').style.display = 'none';
  } else {
    shopifyTab.style.display = '';
    document.getElementById('shopifyNotDetected').style.display = 'none';
    document.getElementById('shopifyContent').style.display = 'block';
  }

  renderOverview(result);
  renderMetaTab(result);
  renderContentTab(result);
  renderTechnicalTab(result);
  renderImagesTab(result);
  renderLinksTab(result);
  renderShopifyTab(result);
  renderPerformanceTab(result);
}

// ===== OVERVIEW TAB =====
function renderOverview(result) {
  // Gauge
  const color = getScoreColor(result.overallScore);
  const arc = document.getElementById('spGaugeArc');
  const circumference = 2 * Math.PI * 52;
  arc.style.stroke = color;
  arc.style.strokeDashoffset = circumference - (result.overallScore / 100) * circumference;

  document.getElementById('spScoreValue').textContent = result.overallScore;
  document.getElementById('spScoreValue').style.color = color;
  document.getElementById('spScoreGrade').textContent = getGrade(result.overallScore);
  document.getElementById('spScoreGrade').style.color = color;

  // Page info
  const pageInfo = document.getElementById('spPageInfo');
  try {
    const urlObj = new URL(result.url);
    pageInfo.textContent = urlObj.hostname + urlObj.pathname;
  } catch { pageInfo.textContent = result.url; }

  const shopifyInfo = document.getElementById('spShopifyInfo');
  if (result.isShopify) {
    shopifyInfo.innerHTML = `<span style="color: #7ec832;">Shopify Store</span> &middot; ${result.pageType} page &middot; ${result.shopifyConfidence}% confidence`;
  } else {
    shopifyInfo.textContent = 'Non-Shopify website';
  }

  // Stats grid
  const statsGrid = document.getElementById('spStatsGrid');
  statsGrid.innerHTML = `
    <div class="sp-stat"><span class="sp-stat-value" style="color: var(--critical)">${result.issueCount.critical}</span><span class="sp-stat-label">Critical</span></div>
    <div class="sp-stat"><span class="sp-stat-value" style="color: var(--warning)">${result.issueCount.warning}</span><span class="sp-stat-label">Warnings</span></div>
    <div class="sp-stat"><span class="sp-stat-value" style="color: var(--info)">${result.issueCount.info}</span><span class="sp-stat-label">Info</span></div>
    <div class="sp-stat"><span class="sp-stat-value" style="color: var(--pass)">${result.issueCount.pass}</span><span class="sp-stat-label">Passed</span></div>
  `;

  // Category bars
  const catBars = document.getElementById('spCategoryBars');
  catBars.innerHTML = '';
  const cats = Object.entries(result.categoryScores).filter(([cat]) => result.isShopify || cat !== 'shopify');
  cats.forEach(([cat, score]) => {
    const c = getScoreColor(score);
    catBars.innerHTML += `
      <div class="sp-cat-row">
        <span class="sp-cat-name">${CATEGORY_LABELS[cat] || cat}</span>
        <div class="sp-cat-bar"><div class="sp-cat-fill" style="width:${score}%;background:${c}"></div></div>
        <span class="sp-cat-score" style="color:${c}">${score}</span>
      </div>
    `;
  });

  // All issues
  renderAllIssues(result.issues);
}

function renderAllIssues(issues) {
  const container = document.getElementById('spAllIssues');
  let filtered = issues;

  if (currentFilter !== 'all') {
    filtered = issues.filter(i => i.severity === currentFilter);
  }

  // Sort by severity
  const order = { critical: 0, warning: 1, info: 2, pass: 3 };
  filtered.sort((a, b) => (order[a.severity] ?? 4) - (order[b.severity] ?? 4));

  container.innerHTML = filtered.map(issue => renderIssueCard(issue)).join('');
  attachIssueToggle(container);
}

function renderIssueCard(issue) {
  const codeBlock = issue.codeSnippet ? `
    <div class="sp-issue-code">
      <div class="sp-code-header">
        <span>Fix Code</span>
        <button class="sp-copy-btn" data-code="${escapeAttr(issue.codeSnippet)}">Copy</button>
      </div>
      <pre class="sp-code-block">${esc(issue.codeSnippet)}</pre>
    </div>
  ` : '';

  return `
    <div class="sp-issue ${issue.severity}">
      <div class="sp-issue-header">
        <div class="sp-issue-dot ${issue.severity}"></div>
        <span class="sp-issue-title">${esc(issue.title)}</span>
        <span class="sp-issue-badge ${issue.severity}">${issue.severity}</span>
        <span class="sp-issue-expand">&#9662;</span>
      </div>
      <div class="sp-issue-body">
        ${issue.description ? `<p>${esc(issue.description)}</p>` : ''}
        ${issue.recommendation ? `
          <div class="sp-issue-rec">
            <strong>Recommendation:</strong><br>
            ${esc(issue.recommendation)}
          </div>
        ` : ''}
        ${codeBlock}
      </div>
    </div>
  `;
}

function attachIssueToggle(container) {
  container.querySelectorAll('.sp-issue-header').forEach(header => {
    header.addEventListener('click', () => {
      header.closest('.sp-issue').classList.toggle('expanded');
    });
  });

  // Attach copy button handlers
  container.querySelectorAll('.sp-copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const code = btn.getAttribute('data-code');
      navigator.clipboard.writeText(code).then(() => {
        showToast('Code copied to clipboard');
      }).catch(() => {
        showToast('Failed to copy');
      });
    });
  });
}

function renderIssueList(containerId, category, issues) {
  const container = document.getElementById(containerId);
  const filtered = issues.filter(i => i.category === category);
  const order = { critical: 0, warning: 1, info: 2, pass: 3 };
  filtered.sort((a, b) => (order[a.severity] ?? 4) - (order[b.severity] ?? 4));
  container.innerHTML = filtered.map(i => renderIssueCard(i)).join('');
  attachIssueToggle(container);
}

// ===== META TAB (Editable SERP) =====
function renderMetaTab(result) {
  const data = result.data?.meta || {};

  // Editable SERP Preview
  const serp = document.getElementById('serpPreview');
  try {
    const urlObj = new URL(result.url);
    const titleText = data.title || 'No title set';
    const descText = data.metaDescription || 'No meta description set. Google will auto-generate a snippet from page content.';

    serp.innerHTML = `
      <div class="serp-url">${esc(urlObj.origin + urlObj.pathname)}</div>
      <div class="serp-title" contenteditable="true" data-field="title">${esc(titleText)}</div>
      <div class="serp-char-count"><span id="titleCharCount" class="${getCharCountClass(titleText.length, 50, 60)}">${titleText.length}</span>/60 chars</div>
      <div class="serp-desc" contenteditable="true" data-field="description">${esc(descText)}</div>
      <div class="serp-char-count"><span id="descCharCount" class="${getCharCountClass(descText.length, 140, 160)}">${descText.length}</span>/160 chars</div>
    `;

    // Attach editable SERP listeners
    const titleEl = serp.querySelector('[data-field="title"]');
    const descEl = serp.querySelector('[data-field="description"]');

    if (titleEl) {
      titleEl.addEventListener('input', () => {
        const len = titleEl.textContent.length;
        const counter = document.getElementById('titleCharCount');
        counter.textContent = len;
        counter.className = getCharCountClass(len, 50, 60);
      });
    }

    if (descEl) {
      descEl.addEventListener('input', () => {
        const len = descEl.textContent.length;
        const counter = document.getElementById('descCharCount');
        counter.textContent = len;
        counter.className = getCharCountClass(len, 140, 160);
      });
    }
  } catch {
    serp.innerHTML = '<p style="color: #888;">Could not generate preview.</p>';
  }

  // Social Preview
  const social = document.getElementById('socialPreview');
  const ogData = data.og || {};
  social.innerHTML = `
    <div class="social-image">
      ${ogData.image ? `<img src="${esc(ogData.image)}" alt="OG Image" onerror="this.style.display='none'">` : 'No og:image set'}
    </div>
    <div class="social-text">
      <div class="social-domain">${(() => { try { return new URL(result.url).hostname; } catch { return ''; } })()}</div>
      <div class="social-title">${esc(ogData.title || data.title || 'No title')}</div>
      <div class="social-desc">${esc(ogData.description || data.metaDescription || 'No description')}</div>
    </div>
  `;

  // Meta Details
  const details = document.getElementById('metaDetails');
  const items = [
    ['Title', data.title || '(missing)', data.title ? 'good' : 'bad'],
    ['Title Length', `${data.titleLength || 0} chars`, data.titleLength >= 50 && data.titleLength <= 60 ? 'good' : 'warn'],
    ['Description', (data.metaDescription || '(missing)').substring(0, 80) + (data.metaDescription?.length > 80 ? '...' : ''), data.metaDescription ? 'good' : 'bad'],
    ['Desc Length', `${data.metaDescriptionLength || 0} chars`, data.metaDescriptionLength >= 150 && data.metaDescriptionLength <= 160 ? 'good' : 'warn'],
    ['og:title', ogData.title ? 'Set' : 'Missing', ogData.title ? 'good' : 'warn'],
    ['og:image', ogData.image ? 'Set' : 'Missing', ogData.image ? 'good' : 'warn'],
    ['Twitter Card', data.twitter?.card || 'Missing', data.twitter?.card ? 'good' : 'warn'],
    ['Viewport', data.viewport ? 'Set' : 'Missing', data.viewport ? 'good' : 'bad'],
    ['Language', data.language || 'Not set', data.language ? 'good' : 'warn'],
  ];

  details.innerHTML = items.map(([label, value, cls]) =>
    `<div class="sp-detail"><span class="sp-detail-label">${label}</span><span class="sp-detail-value ${cls}">${esc(String(value))}</span></div>`
  ).join('');

  renderIssueList('metaIssues', 'meta', result.issues);
}

function getCharCountClass(len, optimal, max) {
  if (len > max) return 'char-over';
  if (len >= optimal) return 'char-good';
  if (len >= optimal * 0.7) return 'char-close';
  return 'char-short';
}

// ===== CONTENT TAB =====
function renderContentTab(result) {
  const contentData = result.data?.content || {};
  const headingData = result.data?.headings || {};

  // Stats
  const stats = document.getElementById('contentStats');
  stats.innerHTML = `
    <div class="sp-stat"><span class="sp-stat-value">${contentData.wordCount || 0}</span><span class="sp-stat-label">Words</span></div>
    <div class="sp-stat"><span class="sp-stat-value">${contentData.sentenceCount || 0}</span><span class="sp-stat-label">Sentences</span></div>
    <div class="sp-stat"><span class="sp-stat-value">${contentData.readabilityScore || '-'}</span><span class="sp-stat-label">Readability</span></div>
    <div class="sp-stat"><span class="sp-stat-value">${contentData.paragraphCount || 0}</span><span class="sp-stat-label">Paragraphs</span></div>
  `;

  // Heading tree
  const tree = document.getElementById('headingTree');
  const headings = headingData.headings || [];
  tree.innerHTML = headings.length === 0
    ? '<p class="dim">No headings found</p>'
    : headings.map(h => `
        <div class="heading-item" style="padding-left: ${(h.level - 1) * 16}px;">
          <span class="heading-tag">H${h.level}</span>
          <span class="heading-text">${esc(h.text || '(empty)')}</span>
        </div>
      `).join('');

  // Keywords
  const kwTable = document.getElementById('keywordTable');
  const keywords = contentData.topKeywords || [];
  if (keywords.length > 0) {
    const maxCount = keywords[0]?.count || 1;
    kwTable.innerHTML = `
      <div class="kw-row header"><span>Keyword</span><span>Count</span><span>Density</span><span>Distribution</span></div>
      ${keywords.slice(0, 10).map(kw => `
        <div class="kw-row">
          <span>${esc(kw.word)}</span>
          <span>${kw.count}</span>
          <span>${kw.density}%</span>
          <div class="kw-bar"><div class="kw-bar-fill" style="width: ${(kw.count / maxCount) * 100}%"></div></div>
        </div>
      `).join('')}
    `;
  } else {
    kwTable.innerHTML = '<p class="dim">Not enough content to analyze keywords</p>';
  }

  renderIssueList('contentIssues', 'content', result.issues);
}

// ===== TECHNICAL TAB =====
function renderTechnicalTab(result) {
  const techData = result.data?.technical || {};
  const schemaData = result.data?.schema || {};

  // Details
  const details = document.getElementById('technicalDetails');
  const items = [
    ['Canonical', techData.canonical || '(missing)', techData.canonical ? 'good' : 'bad'],
    ['Robots Meta', techData.robotsMeta || '(not set)', techData.robotsMeta?.includes('noindex') ? 'bad' : 'good'],
    ['HTTPS', result.url?.startsWith('https') ? 'Yes' : 'No', result.url?.startsWith('https') ? 'good' : 'bad'],
    ['URL Length', `${techData.urlLength || 0} chars`, (techData.urlLength || 0) <= 115 ? 'good' : 'warn'],
    ['Hreflang Tags', `${(techData.hreflangs || []).length} found`, ''],
    ['JSON-LD Blocks', `${schemaData.jsonLdCount || 0}`, ''],
    ['Schema Types', (schemaData.schemaTypes || []).join(', ') || 'None', schemaData.schemaTypes?.length ? 'good' : 'warn'],
  ];

  details.innerHTML = items.map(([label, value, cls]) =>
    `<div class="sp-detail"><span class="sp-detail-label">${label}</span><span class="sp-detail-value ${cls}">${esc(String(value))}</span></div>`
  ).join('');

  // Schema viewer
  const viewer = document.getElementById('schemaViewer');
  const schemas = schemaData.schemas || [];
  if (schemas.length === 0) {
    viewer.innerHTML = '<p class="dim">No structured data found on this page. Structured data (JSON-LD) enables rich snippets in search results.</p>';
  } else {
    viewer.innerHTML = schemas.map((s, i) => {
      const schemaType = s['@type'] || `Block ${i + 1}`;
      const fields = Object.keys(s).filter(k => k !== '@context' && k !== '@type');
      const fieldSummary = fields.slice(0, 5).join(', ') + (fields.length > 5 ? ` +${fields.length - 5} more` : '');
      return `
      <div class="schema-block">
        <div class="schema-header">
          <div class="schema-header-info">
            <span class="schema-type-badge">${esc(schemaType)}</span>
            <span class="schema-field-summary">${esc(fieldSummary)}</span>
          </div>
          <span class="schema-expand-icon">&#9662;</span>
        </div>
        <div class="schema-body">
          <div class="schema-fields">
            ${fields.map(key => {
              const val = s[key];
              const display = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val);
              const truncated = display.length > 120 ? display.substring(0, 120) + '...' : display;
              return `<div class="schema-field-row">
                <span class="schema-field-key">${esc(key)}</span>
                <span class="schema-field-val" title="${escapeAttr(display)}">${esc(truncated)}</span>
              </div>`;
            }).join('')}
          </div>
          <details class="schema-raw">
            <summary>View Raw JSON</summary>
            <pre class="schema-code">${esc(JSON.stringify(s, null, 2))}</pre>
          </details>
        </div>
      </div>
    `}).join('');

    // Attach toggle listeners (no inline onclick - CSP safe)
    viewer.querySelectorAll('.schema-header').forEach(header => {
      header.addEventListener('click', () => {
        header.closest('.schema-block').classList.toggle('expanded');
      });
    });
  }

  renderIssueList('technicalIssues', 'technical', result.issues);
}

// ===== IMAGES TAB =====
function renderImagesTab(result) {
  const imgData = result.data?.images || {};

  const stats = document.getElementById('imageStats');
  stats.innerHTML = `
    <div class="sp-stat"><span class="sp-stat-value">${imgData.totalImages || 0}</span><span class="sp-stat-label">Total</span></div>
    <div class="sp-stat"><span class="sp-stat-value" style="color:${imgData.missingAlt ? 'var(--critical)' : 'var(--pass)'}">${imgData.missingAlt || 0}</span><span class="sp-stat-label">No Alt</span></div>
    <div class="sp-stat"><span class="sp-stat-value">${imgData.lazyLoaded || 0}</span><span class="sp-stat-label">Lazy</span></div>
    <div class="sp-stat"><span class="sp-stat-value">${imgData.modernFormat || 0}</span><span class="sp-stat-label">WebP/AVIF</span></div>
  `;

  // Image audit table
  const audit = document.getElementById('imageAudit');
  const images = (imgData.imageDetails || []).slice(0, 50);
  if (images.length === 0) {
    audit.innerHTML = '<p class="dim">No images found on page</p>';
  } else {
    // Determine format from src
    function getImgFormat(src) {
      const s = src.toLowerCase();
      if (s.includes('.webp') || s.includes('format=webp')) return 'WEBP';
      if (s.includes('.avif')) return 'AVIF';
      if (s.includes('.svg')) return 'SVG';
      if (s.includes('.png')) return 'PNG';
      if (s.includes('.gif')) return 'GIF';
      if (s.includes('.jpg') || s.includes('.jpeg')) return 'JPG';
      return '?';
    }

    function getFilename(src) {
      try {
        const parts = src.split('?')[0].split('/');
        const name = parts[parts.length - 1] || '';
        return name.length > 35 ? '...' + name.slice(-32) : name;
      } catch { return src.substring(0, 35); }
    }

    audit.innerHTML = `
      <div class="img-audit-header">
        <span>#</span><span>File</span><span>Format</span><span>Alt</span><span>Lazy</span><span>Dims</span>
      </div>
      ${images.map((img, idx) => {
        const fmt = getImgFormat(img.src);
        const hasDims = img.width && img.height;
        const altText = img.alt ? img.alt.substring(0, 40) : '';
        return `
        <div class="img-row-v2" title="${escapeAttr(img.src)}">
          <span class="img-idx">${idx + 1}</span>
          <div class="img-info">
            <div class="img-filename">${esc(getFilename(img.src))}</div>
            ${img.hasAlt && altText ? `<div class="img-alt-preview">alt: "${esc(altText)}"</div>` : ''}
          </div>
          <span class="img-badge ${img.isModern ? 'ok' : fmt === '?' ? 'warn' : 'neutral'}">${fmt}</span>
          <span class="img-badge ${img.hasAlt ? (img.alt ? 'ok' : 'warn') : 'bad'}">${img.hasAlt ? (img.alt ? 'YES' : 'EMPTY') : 'NO'}</span>
          <span class="img-badge ${img.isLazy ? 'ok' : 'warn'}">${img.isLazy ? 'YES' : 'NO'}</span>
          <span class="img-badge ${hasDims ? 'ok' : 'bad'}">${hasDims ? img.width + 'x' + img.height : 'NONE'}</span>
        </div>`;
      }).join('')}
    `;
  }

  renderIssueList('imageIssues', 'images', result.issues);
}

// ===== LINKS TAB =====
function renderLinksTab(result) {
  const linkData = result.data?.links || {};

  const stats = document.getElementById('linkStats');
  stats.innerHTML = `
    <div class="sp-stat"><span class="sp-stat-value">${linkData.totalLinks || 0}</span><span class="sp-stat-label">Total</span></div>
    <div class="sp-stat"><span class="sp-stat-value">${linkData.internal || 0}</span><span class="sp-stat-label">Internal</span></div>
    <div class="sp-stat"><span class="sp-stat-value">${linkData.external || 0}</span><span class="sp-stat-label">External</span></div>
    <div class="sp-stat"><span class="sp-stat-value">${linkData.nofollow || 0}</span><span class="sp-stat-label">Nofollow</span></div>
  `;

  // External domains
  const domains = document.getElementById('externalDomains');
  const extDomains = linkData.externalDomains || [];
  if (extDomains.length === 0) {
    domains.innerHTML = '<p class="dim">No external links found</p>';
  } else {
    domains.innerHTML = extDomains.map(d =>
      `<div class="sp-detail"><span class="sp-detail-label">${esc(d)}</span><span class="sp-detail-value">External</span></div>`
    ).join('');
  }

  renderIssueList('linkIssues', 'links', result.issues);
}

// ===== SHOPIFY TAB =====
function renderShopifyTab(result) {
  if (!result.isShopify) return;

  const details = document.getElementById('shopifyDetails');
  const items = [
    ['Platform', 'Shopify', 'good'],
    ['Confidence', `${result.shopifyConfidence}%`, result.shopifyConfidence >= 70 ? 'good' : 'warn'],
    ['Page Type', result.pageType, ''],
    ['Signals', result.shopifySignals?.join(', ') || 'None', ''],
  ];

  // Add page-type specific data
  if (result.data?.product) {
    items.push(['Product Desc Words', `${result.data.product.productDescriptionWords || 0}`, result.data.product.productDescriptionWords >= 150 ? 'good' : 'warn']);
    items.push(['Product Images', `${result.data.product.productImageCount || 0}`, result.data.product.productImageCount >= 3 ? 'good' : 'warn']);
    items.push(['Has Reviews', result.data.product.hasReviews ? 'Yes' : 'No', result.data.product.hasReviews ? 'good' : 'warn']);
  }

  if (result.data?.collection) {
    items.push(['Has Description', result.data.collection.hasDescription ? 'Yes' : 'No', result.data.collection.hasDescription ? 'good' : 'bad']);
    items.push(['Products Listed', `${result.data.collection.productCount || 0}`, '']);
  }

  if (result.data?.themeIssues) {
    items.push(['Has Breadcrumbs', result.data.themeIssues.hasBreadcrumbs ? 'Yes' : 'No', result.data.themeIssues.hasBreadcrumbs ? 'good' : 'warn']);
    items.push(['Has Search', result.data.themeIssues.hasSearch ? 'Yes' : 'No', result.data.themeIssues.hasSearch ? 'good' : 'warn']);
    items.push(['Social Links', `${result.data.themeIssues.socialLinkCount || 0}`, '']);
    items.push(['App Scripts', `${result.data.themeIssues.appScriptCount || 0}`, result.data.themeIssues.appScriptCount > 5 ? 'warn' : 'good']);
  }

  details.innerHTML = items.map(([label, value, cls]) =>
    `<div class="sp-detail"><span class="sp-detail-label">${label}</span><span class="sp-detail-value ${cls}">${esc(String(value))}</span></div>`
  ).join('');

  renderIssueList('shopifyIssues', 'shopify', result.issues);
}

// ===== PERFORMANCE TAB (Enhanced with CWV) =====
function renderPerformanceTab(result) {
  const perfData = result.data?.performance || {};
  const cwvData = result.data?.cwv || {};

  // Core Web Vitals
  const cwvContainer = document.getElementById('cwvMetrics');
  const cwvMetrics = [
    { label: 'LCP', fullLabel: 'Largest Contentful Paint', value: cwvData.lcp, unit: 's', good: 2.5, poor: 4.0 },
    { label: 'FID', fullLabel: 'First Input Delay', value: cwvData.fid, unit: 'ms', good: 100, poor: 300 },
    { label: 'CLS', fullLabel: 'Cumulative Layout Shift', value: cwvData.cls, unit: '', good: 0.1, poor: 0.25 },
    { label: 'FCP', fullLabel: 'First Contentful Paint', value: cwvData.fcp, unit: 's', good: 1.8, poor: 3.0 },
    { label: 'TTFB', fullLabel: 'Time to First Byte', value: cwvData.ttfb, unit: 'ms', good: 800, poor: 1800 },
    { label: 'INP', fullLabel: 'Interaction to Next Paint', value: cwvData.inp, unit: 'ms', good: 200, poor: 500 },
  ];

  const hasCwv = cwvMetrics.some(m => m.value !== undefined && m.value !== null);
  if (hasCwv) {
    cwvContainer.innerHTML = cwvMetrics.filter(m => m.value !== undefined && m.value !== null).map(m => {
      let status = 'good';
      if (m.value > m.poor) status = 'poor';
      else if (m.value > m.good) status = 'needs-improvement';
      const statusLabel = status === 'good' ? 'Good' : status === 'needs-improvement' ? 'Needs Work' : 'Poor';
      const statusColor = status === 'good' ? 'var(--pass)' : status === 'needs-improvement' ? 'var(--warning)' : 'var(--critical)';
      return `
        <div class="cwv-metric cwv-${status}">
          <div class="cwv-label">${m.label}</div>
          <div class="cwv-value" style="color:${statusColor}">${m.value}${m.unit}</div>
          <div class="cwv-full-label">${m.fullLabel}</div>
          <div class="cwv-status" style="color:${statusColor}">${statusLabel}</div>
        </div>
      `;
    }).join('');
  } else {
    cwvContainer.innerHTML = '<p class="dim">Core Web Vitals data not available. Run a Lighthouse audit or use PageSpeed Insights for CWV metrics.</p>';
  }

  const stats = document.getElementById('perfStats');
  stats.innerHTML = `
    <div class="sp-stat"><span class="sp-stat-value">${perfData.domElements || 0}</span><span class="sp-stat-label">DOM Elements</span></div>
    <div class="sp-stat"><span class="sp-stat-value">${perfData.maxDomDepth || 0}</span><span class="sp-stat-label">Max Depth</span></div>
    <div class="sp-stat"><span class="sp-stat-value">${perfData.totalScripts || 0}</span><span class="sp-stat-label">Scripts</span></div>
    <div class="sp-stat"><span class="sp-stat-value">${perfData.totalStylesheets || 0}</span><span class="sp-stat-label">CSS Files</span></div>
    <div class="sp-stat"><span class="sp-stat-value">${perfData.blockingJS || 0}</span><span class="sp-stat-label">Blocking JS</span></div>
    <div class="sp-stat"><span class="sp-stat-value">${perfData.blockingCSS || 0}</span><span class="sp-stat-label">Blocking CSS</span></div>
    <div class="sp-stat"><span class="sp-stat-value">${perfData.thirdPartyScripts || 0}</span><span class="sp-stat-label">3rd Party</span></div>
    <div class="sp-stat"><span class="sp-stat-value">${perfData.iframeCount || 0}</span><span class="sp-stat-label">iFrames</span></div>
  `;

  // Combine performance issues
  const perfIssues = result.issues.filter(i => i.category === 'performance');
  const container = document.getElementById('perfIssues');
  const order = { critical: 0, warning: 1, info: 2, pass: 3 };
  perfIssues.sort((a, b) => (order[a.severity] ?? 4) - (order[b.severity] ?? 4));
  container.innerHTML = perfIssues.map(i => renderIssueCard(i)).join('');
  attachIssueToggle(container);
}

// ===== HISTORY TAB (Enhanced with Trends) =====
function loadHistory() {
  if (!analysisResult) return;

  try {
    const domain = new URL(analysisResult.url).hostname;
    chrome.runtime.sendMessage({ type: 'GET_HISTORY', domain }, (response) => {
      const history = response?.history || [];
      renderHistory(history);
    });
  } catch {}
}

function renderHistory(history) {
  const chart = document.getElementById('historyChart');
  const list = document.getElementById('historyList');
  const trendEl = document.getElementById('historyTrend');

  if (history.length === 0) {
    chart.innerHTML = '<div class="sp-empty-state">No history yet. Run analyses to build a score history.</div>';
    list.innerHTML = '';
    trendEl.innerHTML = '';
    return;
  }

  // Trend indicator
  if (history.length >= 2) {
    const latest = history[0].overallScore;
    const previous = history[1].overallScore;
    const diff = latest - previous;
    let trendIcon, trendText, trendColor;
    if (diff > 0) {
      trendIcon = '&#9650;';
      trendText = `Improving (+${diff} points since last analysis)`;
      trendColor = 'var(--pass)';
    } else if (diff < 0) {
      trendIcon = '&#9660;';
      trendText = `Declining (${diff} points since last analysis)`;
      trendColor = 'var(--critical)';
    } else {
      trendIcon = '&#9644;';
      trendText = 'No change since last analysis';
      trendColor = 'var(--text-dim)';
    }

    // Calculate overall trend from last 5 entries
    const recentEntries = history.slice(0, Math.min(5, history.length));
    let overallTrend = '';
    if (recentEntries.length >= 3) {
      const oldest = recentEntries[recentEntries.length - 1].overallScore;
      const newest = recentEntries[0].overallScore;
      const totalDiff = newest - oldest;
      if (totalDiff > 5) overallTrend = ' | Overall trend: Strong improvement';
      else if (totalDiff > 0) overallTrend = ' | Overall trend: Slight improvement';
      else if (totalDiff < -5) overallTrend = ' | Overall trend: Significant decline';
      else if (totalDiff < 0) overallTrend = ' | Overall trend: Slight decline';
      else overallTrend = ' | Overall trend: Stable';
    }

    trendEl.innerHTML = `<div class="trend-banner" style="color:${trendColor}"><span class="trend-icon">${trendIcon}</span> ${trendText}${overallTrend}</div>`;
  } else {
    trendEl.innerHTML = '';
  }

  // Simple SVG sparkline chart
  const scores = history.slice(0, 20).reverse();
  const width = 280;
  const height = 120;
  const padding = 20;

  if (scores.length > 1) {
    const maxScore = 100;
    const xStep = (width - padding * 2) / (scores.length - 1);

    let pathD = '';
    let dots = '';
    scores.forEach((entry, i) => {
      const x = padding + i * xStep;
      const y = padding + (1 - entry.overallScore / maxScore) * (height - padding * 2);
      if (i === 0) pathD += `M ${x} ${y}`;
      else pathD += ` L ${x} ${y}`;
      dots += `<circle cx="${x}" cy="${y}" r="3" fill="${getScoreColor(entry.overallScore)}" />`;
    });

    chart.innerHTML = `
      <svg width="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
        <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="var(--border)" stroke-width="1"/>
        <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="var(--border)" stroke-width="1"/>
        <text x="${padding - 5}" y="${padding + 4}" fill="var(--text-dim)" font-size="8" text-anchor="end">100</text>
        <text x="${padding - 5}" y="${height - padding + 4}" fill="var(--text-dim)" font-size="8" text-anchor="end">0</text>
        <path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="2"/>
        ${dots}
      </svg>
    `;
  } else {
    chart.innerHTML = '<div class="sp-empty-state">Need at least 2 analyses to show a chart.</div>';
  }

  // History list with score change indicators
  list.innerHTML = history.slice(0, 20).map((entry, index) => {
    const date = new Date(entry.timestamp);
    const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const color = getScoreColor(entry.overallScore);

    // Calculate score change from previous entry
    let changeHtml = '';
    if (index < history.length - 1) {
      const prevEntry = history[index + 1];
      const diff = entry.overallScore - prevEntry.overallScore;
      if (diff > 0) {
        changeHtml = `<span class="history-change positive">+${diff}</span>`;
      } else if (diff < 0) {
        changeHtml = `<span class="history-change negative">${diff}</span>`;
      } else {
        changeHtml = `<span class="history-change neutral">0</span>`;
      }
    }

    return `
      <div class="history-item">
        <div>
          <span class="history-url">${esc(entry.url)}</span>
          <div class="history-date">${dateStr}</div>
        </div>
        <div class="history-score-wrap">
          ${changeHtml}
          <span class="history-score" style="color: ${color}">${entry.overallScore}</span>
        </div>
      </div>
    `;
  }).join('');
}

function clearHistory() {
  if (!analysisResult) return;
  try {
    const domain = new URL(analysisResult.url).hostname;
    chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY', domain }, () => {
      loadHistory();
    });
  } catch {}
}

// ===== EXPORT CSV =====
function exportCSV() {
  if (!analysisResult) return;
  chrome.runtime.sendMessage({ type: 'EXPORT_CSV', issues: analysisResult.issues }, (response) => {
    if (response?.csv) {
      const blob = new Blob([response.csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `seo-report-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  });
}

// ===== EXPORT PDF =====
function exportPDF() {
  if (!analysisResult) return;
  const r = analysisResult;
  const grade = getGrade(r.overallScore);
  const date = new Date().toLocaleDateString();

  const html = `<!DOCTYPE html>
<html><head><title>SEO Report - ${esc(r.url)}</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1a1a2e; }
  h1 { color: #5E5CE6; } h2 { margin-top: 30px; border-bottom: 2px solid #eee; padding-bottom: 8px; }
  .score { font-size: 48px; font-weight: 800; } .grade { font-size: 24px; color: #666; }
  .issue { padding: 8px 0; border-bottom: 1px solid #eee; }
  .critical { color: #ef4444; } .warning { color: #eab308; } .info { color: #3b82f6; } .pass { color: #22c55e; }
  .cat-row { display: flex; justify-content: space-between; padding: 6px 0; }
  .code { background: #f5f5f5; padding: 8px; border-radius: 4px; font-family: monospace; font-size: 12px; white-space: pre-wrap; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; } th, td { padding: 8px; text-align: left; border-bottom: 1px solid #eee; }
  @media print { body { padding: 20px; } }
</style>
</head><body>
<h1>SEO Analysis Report</h1>
<p><strong>URL:</strong> ${esc(r.url)}<br><strong>Date:</strong> ${date}<br>
${r.isShopify ? `<strong>Platform:</strong> Shopify (${r.shopifyConfidence}% confidence) | ${r.pageType} page` : ''}</p>

<div><span class="score" style="color:${getScoreColor(r.overallScore)}">${r.overallScore}</span> <span class="grade">${grade}</span></div>

<h2>Category Scores</h2>
${Object.entries(r.categoryScores).filter(([c]) => r.isShopify || c !== 'shopify').map(([cat, score]) =>
  `<div class="cat-row"><span>${CATEGORY_LABELS[cat] || cat}</span><span style="color:${getScoreColor(score)};font-weight:700">${score}/100</span></div>`
).join('')}

<h2>Issues Found</h2>
<table><tr><th>Severity</th><th>Category</th><th>Issue</th><th>Fix</th></tr>
${r.issues.filter(i => i.severity !== 'pass').sort((a,b) => {
  const o = {critical:0,warning:1,info:2};
  return (o[a.severity]??3) - (o[b.severity]??3);
}).map(i => `<tr>
  <td class="${i.severity}">${i.severity.toUpperCase()}</td>
  <td>${i.category}</td>
  <td>${esc(i.title)}</td>
  <td>${esc(i.recommendation || '')}${i.codeSnippet ? `<div class="code">${esc(i.codeSnippet)}</div>` : ''}</td>
</tr>`).join('')}
</table>

<p style="margin-top:40px;color:#888;font-size:12px;">Generated by ShopifySEO Pro</p>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) {
    setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 500);
  } else {
    // Fallback: download as HTML
    const a = document.createElement('a');
    a.href = url;
    a.download = `seo-report-${new Date().toISOString().split('T')[0]}.html`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('PDF popup blocked - downloaded as HTML instead');
  }
}

// ===== CRAWLER TAB =====
async function startCrawl() {
  if (!analysisResult) return;

  const baseUrl = new URL(analysisResult.url).origin;
  document.getElementById('startCrawlBtn').style.display = 'none';
  document.getElementById('crawlProgress').style.display = 'block';
  document.getElementById('crawlResults').style.display = 'none';

  // Get sitemap URLs
  let urls = [];
  try {
    const sitemapResponse = await sendMessage({ type: 'CRAWL_SITEMAP', baseUrl });
    urls = sitemapResponse?.urls || [];
  } catch (e) {
    // Sitemap fetch failed
  }

  if (urls.length === 0) {
    // Fallback: use internal links from current page
    const linkMap = analysisResult.data?.links?.internalLinkMap || [];
    urls = linkMap
      .map(l => {
        try {
          // Handle both absolute and relative URLs
          if (l.to.startsWith('http')) return l.to;
          return baseUrl + (l.to.startsWith('/') ? l.to : '/' + l.to);
        } catch { return null; }
      })
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i);
  }

  // Cap at 50 pages for performance
  urls = urls.slice(0, 50);
  const total = urls.length;

  if (total === 0) {
    document.getElementById('crawlProgress').style.display = 'none';
    document.getElementById('startCrawlBtn').style.display = 'block';
    showToast('No pages found to crawl. Check if sitemap exists.');
    return;
  }

  let completed = 0;
  const results = [];

  // Process in batches of 3
  for (let i = 0; i < urls.length; i += 3) {
    const batch = urls.slice(i, i + 3);
    const batchResults = await Promise.all(batch.map(async (url) => {
      try {
        const pageResponse = await sendMessage({ type: 'FETCH_PAGE', url });
        if (pageResponse?.error) return { url, error: pageResponse.error };
        const analysis = await sendMessageToTab({ type: 'ANALYZE_HTML', html: pageResponse.html, url });
        if (!analysis || analysis.error) return { url, error: analysis?.error || 'Analysis failed' };
        return { url, ...analysis };
      } catch (err) {
        return { url, error: err.message };
      }
    }));

    results.push(...batchResults);
    completed += batch.length;
    updateCrawlProgress(completed, total);
  }

  renderCrawlResults(results);
}

function updateCrawlProgress(completed, total) {
  const pct = Math.round((completed / total) * 100);
  document.getElementById('crawlProgressFill').style.width = pct + '%';
  document.getElementById('crawlProgressText').textContent = `${completed}/${total} pages`;
}

function renderCrawlResults(results) {
  document.getElementById('crawlProgress').style.display = 'none';
  document.getElementById('crawlResults').style.display = 'block';

  const successResults = results.filter(r => !r.error && r.overallScore !== undefined);
  const failedResults = results.filter(r => r.error);

  // Summary stats
  const avgScore = successResults.length > 0
    ? Math.round(successResults.reduce((sum, r) => sum + r.overallScore, 0) / successResults.length)
    : 0;
  const totalCritical = successResults.reduce((sum, r) => sum + (r.issueCount?.critical || 0), 0);
  const totalWarning = successResults.reduce((sum, r) => sum + (r.issueCount?.warning || 0), 0);

  document.getElementById('crawlSummary').innerHTML = `
    <div class="sp-stat"><span class="sp-stat-value">${successResults.length}</span><span class="sp-stat-label">Pages Crawled</span></div>
    <div class="sp-stat"><span class="sp-stat-value" style="color:${getScoreColor(avgScore)}">${avgScore}</span><span class="sp-stat-label">Avg Score</span></div>
    <div class="sp-stat"><span class="sp-stat-value" style="color:var(--critical)">${totalCritical}</span><span class="sp-stat-label">Total Critical</span></div>
    <div class="sp-stat"><span class="sp-stat-value" style="color:var(--warning)">${totalWarning}</span><span class="sp-stat-label">Total Warnings</span></div>
  `;

  // Page list sorted by score (worst first)
  const sorted = [...successResults].sort((a, b) => a.overallScore - b.overallScore);
  const pageList = document.getElementById('crawlPageList');
  pageList.innerHTML = sorted.map(r => {
    const color = getScoreColor(r.overallScore);
    let path;
    try { path = new URL(r.url).pathname; } catch { path = r.url; }
    return `
      <div class="crawl-page-item">
        <div class="crawl-page-info">
          <span class="crawl-page-url" title="${esc(r.url)}">${esc(path.length > 40 ? '...' + path.slice(-37) : path)}</span>
          <span class="crawl-page-issues dim">${r.issueCount?.critical || 0} critical, ${r.issueCount?.warning || 0} warnings</span>
        </div>
        <span class="crawl-page-score" style="color:${color}">${r.overallScore}</span>
      </div>
    `;
  }).join('');

  // Add failed pages
  if (failedResults.length > 0) {
    pageList.innerHTML += failedResults.map(r => `
      <div class="crawl-page-item crawl-page-error">
        <div class="crawl-page-info">
          <span class="crawl-page-url" title="${esc(r.url)}">${esc(r.url)}</span>
          <span class="crawl-page-issues dim" style="color:var(--critical)">${esc(r.error)}</span>
        </div>
        <span class="crawl-page-score" style="color:var(--critical)">ERR</span>
      </div>
    `).join('');
  }

  // Common issues (aggregate by issue ID/title across pages)
  const issueCounts = {};
  successResults.forEach(r => {
    (r.issues || []).forEach(issue => {
      if (issue.severity === 'pass') return;
      const key = issue.id || issue.title;
      if (!issueCounts[key]) {
        issueCounts[key] = { ...issue, pageCount: 0 };
      }
      issueCounts[key].pageCount++;
    });
  });

  const commonIssues = Object.values(issueCounts)
    .sort((a, b) => b.pageCount - a.pageCount)
    .slice(0, 15);

  const commonContainer = document.getElementById('crawlCommonIssues');
  commonContainer.innerHTML = commonIssues.map(issue => `
    <div class="sp-issue ${issue.severity}">
      <div class="sp-issue-header">
        <div class="sp-issue-dot ${issue.severity}"></div>
        <span class="sp-issue-title">${esc(issue.title)}</span>
        <span class="sp-issue-badge ${issue.severity}">${issue.pageCount} pages</span>
      </div>
    </div>
  `).join('');

  // Re-enable the crawl button for re-crawling
  document.getElementById('startCrawlBtn').style.display = 'block';
  document.getElementById('startCrawlBtn').textContent = 'Re-crawl Site';
}

// ===== COMPARE TAB =====
async function startCompare() {
  if (!analysisResult) return;

  const urlInput = document.getElementById('competitorUrl');
  const competitorUrl = urlInput.value.trim();

  if (!competitorUrl) {
    showToast('Please enter a competitor URL');
    return;
  }

  try {
    new URL(competitorUrl);
  } catch {
    showToast('Please enter a valid URL');
    return;
  }

  document.getElementById('compareLoading').style.display = 'flex';
  document.getElementById('compareResults').style.display = 'none';
  document.getElementById('compareBtn').disabled = true;

  try {
    // Fetch competitor page
    const pageResponse = await sendMessage({ type: 'FETCH_PAGE', url: competitorUrl });
    if (pageResponse?.error) {
      showToast('Failed to fetch competitor page: ' + pageResponse.error);
      document.getElementById('compareLoading').style.display = 'none';
      document.getElementById('compareBtn').disabled = false;
      return;
    }

    // Analyze competitor HTML
    const theirResult = await sendMessageToTab({ type: 'ANALYZE_HTML', html: pageResponse.html, url: competitorUrl });
    if (!theirResult || theirResult.error) {
      showToast('Failed to analyze competitor page');
      document.getElementById('compareLoading').style.display = 'none';
      document.getElementById('compareBtn').disabled = false;
      return;
    }

    document.getElementById('compareLoading').style.display = 'none';
    document.getElementById('compareBtn').disabled = false;
    renderComparison(analysisResult, theirResult);
  } catch (err) {
    showToast('Comparison failed: ' + err.message);
    document.getElementById('compareLoading').style.display = 'none';
    document.getElementById('compareBtn').disabled = false;
  }
}

function renderComparison(myResult, theirResult) {
  document.getElementById('compareResults').style.display = 'block';

  // Score comparison - two gauges side by side
  const myColor = getScoreColor(myResult.overallScore);
  const theirColor = getScoreColor(theirResult.overallScore);
  let myHostname, theirHostname;
  try { myHostname = new URL(myResult.url).hostname; } catch { myHostname = 'Your Site'; }
  try { theirHostname = new URL(theirResult.url).hostname; } catch { theirHostname = 'Competitor'; }

  document.getElementById('compareScores').innerHTML = `
    <div class="compare-score-card">
      <div class="compare-label">${esc(myHostname)}</div>
      <div class="compare-score-value" style="color:${myColor}">${myResult.overallScore}</div>
      <div class="compare-grade" style="color:${myColor}">${getGrade(myResult.overallScore)}</div>
    </div>
    <div class="compare-vs">VS</div>
    <div class="compare-score-card">
      <div class="compare-label">${esc(theirHostname)}</div>
      <div class="compare-score-value" style="color:${theirColor}">${theirResult.overallScore}</div>
      <div class="compare-grade" style="color:${theirColor}">${getGrade(theirResult.overallScore)}</div>
    </div>
  `;

  // Category comparison bars
  const categories = Object.keys(myResult.categoryScores).filter(c => myResult.isShopify || c !== 'shopify');
  document.getElementById('compareCats').innerHTML = categories.map(cat => {
    const myScore = myResult.categoryScores[cat] || 0;
    const theirScore = theirResult.categoryScores?.[cat] || 0;
    const myC = getScoreColor(myScore);
    const theirC = getScoreColor(theirScore);
    return `
      <div class="compare-cat-row">
        <span class="compare-cat-name">${CATEGORY_LABELS[cat] || cat}</span>
        <div class="compare-dual-bar">
          <div class="compare-bar-wrap">
            <div class="compare-bar-fill" style="width:${myScore}%;background:${myC}"></div>
          </div>
          <div class="compare-bar-wrap">
            <div class="compare-bar-fill" style="width:${theirScore}%;background:${theirC}"></div>
          </div>
        </div>
        <div class="compare-cat-scores">
          <span style="color:${myC}">${myScore}</span>
          <span style="color:${theirC}">${theirScore}</span>
        </div>
      </div>
    `;
  }).join('');

  // What they do better / what you do better
  const myIssueMap = {};
  const theirIssueMap = {};
  (myResult.issues || []).forEach(i => { myIssueMap[i.id || i.title] = i; });
  (theirResult.issues || []).forEach(i => { theirIssueMap[i.id || i.title] = i; });

  const theyWin = [];
  const youWin = [];

  Object.keys({ ...myIssueMap, ...theirIssueMap }).forEach(key => {
    const my = myIssueMap[key];
    const their = theirIssueMap[key];
    const severityOrder = { critical: 0, warning: 1, info: 2, pass: 3 };

    if (my && their) {
      const mySev = severityOrder[my.severity] ?? 4;
      const theirSev = severityOrder[their.severity] ?? 4;
      if (theirSev > mySev) {
        // They have worse severity = you're better
        youWin.push(my);
      } else if (mySev > theirSev) {
        // You have worse severity = they're better
        theyWin.push(my);
      }
    } else if (my && !their) {
      // They don't have this issue
      if (my.severity !== 'pass') theyWin.push(my);
    } else if (!my && their) {
      // You don't have this issue
      if (their.severity !== 'pass') youWin.push(their);
    }
  });

  const renderCompareIssues = (issues) => {
    if (issues.length === 0) return '<div class="sp-empty-state">No differences found</div>';
    return issues.slice(0, 10).map(i => `
      <div class="sp-issue ${i.severity}">
        <div class="sp-issue-header" style="cursor:default;">
          <div class="sp-issue-dot ${i.severity}"></div>
          <span class="sp-issue-title">${esc(i.title)}</span>
          <span class="sp-issue-badge ${i.severity}">${i.severity}</span>
        </div>
      </div>
    `).join('');
  };

  document.getElementById('compareTheyWin').innerHTML = renderCompareIssues(theyWin);
  document.getElementById('compareYouWin').innerHTML = renderCompareIssues(youWin);
}

// ===== LINK MAP TAB =====
function renderLinkMap(linkData) {
  const container = document.getElementById('linkMapContainer');
  const detailsEl = document.getElementById('linkMapDetails');
  const orphansEl = document.getElementById('linkMapOrphans');
  const links = linkData.internalLinkMap || [];

  if (links.length === 0) {
    container.innerHTML = '<div class="sp-empty-state">No internal links found on this page.</div>';
    detailsEl.innerHTML = '';
    orphansEl.innerHTML = '<p class="dim">No data available.</p>';
    return;
  }

  // Aggregate link data
  const linkCount = {};  // how many times each page is linked TO
  const linkFrom = {};   // outbound count per page
  const linkTexts = {};  // anchor texts per target
  links.forEach(l => {
    linkCount[l.to] = (linkCount[l.to] || 0) + 1;
    linkFrom[l.from] = (linkFrom[l.from] || 0) + 1;
    if (!linkTexts[l.to]) linkTexts[l.to] = [];
    if (l.text && linkTexts[l.to].length < 3) linkTexts[l.to].push(l.text);
  });

  // Get unique pages, sort by link count
  const pages = new Set();
  links.forEach(l => { pages.add(l.from); pages.add(l.to); });
  const pageArray = Array.from(pages).slice(0, 40);
  const maxLinks = Math.max(...Object.values(linkCount), 1);

  let currentPath = '/';
  try { currentPath = new URL(analysisResult.url).pathname; } catch {}

  // Build SVG visualization - force-directed-style circular layout with labeled nodes
  const width = 380;
  const height = 380;
  const cx = width / 2;
  const cy = height / 2;

  // Separate current page (center) from others (ring)
  const otherPages = pageArray.filter(p => p !== currentPath);
  const positions = {};
  positions[currentPath] = { x: cx, y: cy };

  const ringRadius = Math.min(150, 40 + otherPages.length * 4);
  otherPages.forEach((page, i) => {
    const angle = (2 * Math.PI * i) / otherPages.length - Math.PI / 2;
    positions[page] = {
      x: cx + ringRadius * Math.cos(angle),
      y: cy + ringRadius * Math.sin(angle)
    };
  });

  // Build SVG
  let svg = `<svg width="100%" viewBox="0 0 ${width} ${height}" class="linkmap-svg">`;
  svg += `<defs>
    <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto"><polygon points="0 0, 6 2, 0 4" fill="#5E5CE6" opacity="0.4"/></marker>
  </defs>`;

  // Draw edges with arrows
  const drawnEdges = new Set();
  links.forEach(l => {
    const key = l.from + '>' + l.to;
    if (drawnEdges.has(key)) return;
    drawnEdges.add(key);
    if (positions[l.from] && positions[l.to] && l.from !== l.to) {
      const x1 = positions[l.from].x, y1 = positions[l.from].y;
      const x2 = positions[l.to].x, y2 = positions[l.to].y;
      const count = links.filter(ll => ll.from === l.from && ll.to === l.to).length;
      const opacity = Math.min(0.7, 0.15 + count * 0.1);
      const strokeW = Math.min(3, 0.5 + count * 0.5);
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#5E5CE6" stroke-width="${strokeW}" opacity="${opacity}" marker-end="url(#arrowhead)"/>`;
    }
  });

  // Draw nodes with labels
  pageArray.forEach(page => {
    const pos = positions[page];
    if (!pos) return;
    const count = linkCount[page] || 0;
    const isCurrent = page === currentPath;
    const r = isCurrent ? 16 : Math.min(14, 5 + (count / maxLinks) * 9);

    let fillColor, strokeColor;
    if (isCurrent) { fillColor = '#5E5CE6'; strokeColor = '#7B79F0'; }
    else if (count >= 5) { fillColor = '#22c55e'; strokeColor = '#4ade80'; }
    else if (count >= 2) { fillColor = '#eab308'; strokeColor = '#facc15'; }
    else { fillColor = '#8888a0'; strokeColor = '#aaaabc'; }

    // Node circle
    svg += `<circle cx="${pos.x}" cy="${pos.y}" r="${r}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2" opacity="0.85" class="linkmap-node" data-path="${escapeAttr(page)}" data-count="${count}" style="cursor:pointer"/>`;

    // Count badge
    if (count > 0) {
      svg += `<text x="${pos.x}" y="${pos.y + 1}" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="${isCurrent ? 9 : 7}" font-weight="700" pointer-events="none">${count}</text>`;
    }

    // Label below
    const label = page === '/' ? '/' : page.replace(/^\//, '').split('/').pop() || page;
    const truncLabel = label.length > 14 ? label.substring(0, 12) + '..' : label;
    const labelY = pos.y + r + 11;
    if (labelY < height - 5) {
      svg += `<text x="${pos.x}" y="${labelY}" text-anchor="middle" fill="${isCurrent ? '#e4e4ec' : '#8888a0'}" font-size="8" font-weight="${isCurrent ? '600' : '400'}" pointer-events="none">${esc(truncLabel)}</text>`;
    }
  });

  svg += '</svg>';
  container.innerHTML = svg;

  // Interactive hover tooltip
  const tooltip = document.getElementById('linkMapTooltip');
  container.querySelectorAll('.linkmap-node').forEach(node => {
    node.addEventListener('mouseenter', (e) => {
      const path = node.getAttribute('data-path');
      const count = node.getAttribute('data-count');
      const texts = linkTexts[path] || [];
      tooltip.innerHTML = `
        <div class="linkmap-tip-path">${esc(path)}</div>
        <div class="linkmap-tip-count">${count} inbound link${count !== '1' ? 's' : ''}</div>
        ${texts.length > 0 ? `<div class="linkmap-tip-anchors">Anchor texts: ${texts.map(t => '"' + esc(t) + '"').join(', ')}</div>` : ''}
      `;
      tooltip.style.display = 'block';
    });
    node.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });
  });

  // Top link targets table
  const grouped = {};
  links.forEach(l => {
    if (!grouped[l.to]) grouped[l.to] = { count: 0, texts: [], froms: new Set() };
    grouped[l.to].count++;
    grouped[l.to].froms.add(l.from);
    if (l.text && grouped[l.to].texts.length < 3) grouped[l.to].texts.push(l.text);
  });

  const sorted = Object.entries(grouped).sort((a, b) => b[1].count - a[1].count);
  detailsEl.innerHTML = sorted.slice(0, 20).map(([path, info]) => {
    const barWidth = Math.round((info.count / maxLinks) * 100);
    return `
    <div class="linkmap-detail-row">
      <div class="linkmap-detail-info">
        <span class="linkmap-detail-path" title="${esc(path)}">${esc(path.length > 35 ? '...' + path.slice(-32) : path)}</span>
        <span class="linkmap-detail-anchors">${info.texts.length > 0 ? info.texts.map(t => esc(t)).join(' | ') : '<span class="dim">no anchor text</span>'}</span>
      </div>
      <div class="linkmap-detail-bar-wrap">
        <div class="linkmap-detail-bar" style="width:${barWidth}%"></div>
      </div>
      <span class="linkmap-detail-count">${info.count}</span>
    </div>`;
  }).join('');

  // Orphan risk pages (only 1 inbound link)
  const orphans = sorted.filter(([, info]) => info.count === 1);
  if (orphans.length === 0) {
    orphansEl.innerHTML = '<p class="dim" style="padding:8px 0;">No orphan-risk pages found. All linked pages have 2+ inbound links.</p>';
  } else {
    orphansEl.innerHTML = orphans.slice(0, 15).map(([path, info]) => `
      <div class="sp-detail">
        <span class="sp-detail-label" title="${esc(path)}">${esc(path.length > 35 ? '...' + path.slice(-32) : path)}</span>
        <span class="sp-detail-value bad">1 link only</span>
      </div>
    `).join('');
  }
}

// ===== RANK CHECKER TAB =====
async function checkRank() {
  const keyword = document.getElementById('rankKeyword').value.trim();
  if (!keyword) { showToast('Enter a keyword to check'); return; }
  if (!analysisResult) { showToast('Run an analysis first'); return; }

  const btn = document.getElementById('rankCheckBtn');
  btn.disabled = true;
  btn.textContent = 'Checking...';
  document.getElementById('rankLoading').style.display = 'flex';
  document.getElementById('rankResults').style.display = 'none';

  let currentDomain = '';
  try { currentDomain = new URL(analysisResult.url).hostname; } catch {}

  try {
    // Fetch Google search results via service worker
    const query = encodeURIComponent(keyword);
    const googleUrl = `https://www.google.com/search?q=${query}&num=20&hl=en`;
    const response = await sendMessage({ type: 'FETCH_PAGE', url: googleUrl });

    if (response?.error) {
      showToast('Could not reach Google. Try again later.');
      document.getElementById('rankLoading').style.display = 'none';
      btn.disabled = false;
      btn.textContent = 'Check Rank';
      return;
    }

    // Parse the HTML to extract search results
    const parser = new DOMParser();
    const doc = parser.parseFromString(response.html, 'text/html');

    // Extract organic results - Google uses various selectors
    const results = [];
    // Method 1: Standard organic results
    doc.querySelectorAll('div.g, div[data-sokoban-container]').forEach(el => {
      const linkEl = el.querySelector('a[href^="http"]');
      const titleEl = el.querySelector('h3');
      if (linkEl && titleEl) {
        const href = linkEl.getAttribute('href') || '';
        if (href.startsWith('http') && !href.includes('google.com/search')) {
          let domain = '';
          try { domain = new URL(href).hostname; } catch {}
          results.push({
            title: titleEl.textContent?.trim() || '',
            url: href,
            domain: domain,
            snippet: el.querySelector('.VwiC3b, [data-sncf]')?.textContent?.trim() || ''
          });
        }
      }
    });

    // Method 2: Fallback - look for cite elements and their parent structures
    if (results.length === 0) {
      doc.querySelectorAll('a[href^="http"]').forEach(a => {
        const href = a.getAttribute('href') || '';
        const h3 = a.querySelector('h3');
        if (h3 && href.startsWith('http') && !href.includes('google.com')) {
          let domain = '';
          try { domain = new URL(href).hostname; } catch {}
          results.push({
            title: h3.textContent?.trim() || '',
            url: href,
            domain: domain,
            snippet: ''
          });
        }
      });
    }

    // Deduplicate by URL
    const seen = new Set();
    const unique = results.filter(r => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });

    // Find our position
    let ourPosition = -1;
    unique.forEach((r, i) => {
      if (r.domain === currentDomain || r.domain.endsWith('.' + currentDomain) || currentDomain.endsWith('.' + r.domain)) {
        if (ourPosition === -1) ourPosition = i + 1;
      }
    });

    // Save to rank history
    saveRankResult(keyword, currentDomain, ourPosition, unique.length);

    // Render results
    document.getElementById('rankLoading').style.display = 'none';
    document.getElementById('rankResults').style.display = 'block';

    const posCard = document.getElementById('rankPosition');
    if (ourPosition > 0) {
      const posColor = ourPosition <= 3 ? '#22c55e' : ourPosition <= 10 ? '#eab308' : '#f97316';
      posCard.innerHTML = `
        <div class="rank-pos-number" style="color:${posColor}">#${ourPosition}</div>
        <div class="rank-pos-info">
          <div class="rank-pos-keyword">"${esc(keyword)}"</div>
          <div class="rank-pos-domain">${esc(currentDomain)}</div>
          <div class="rank-pos-label" style="color:${posColor}">
            ${ourPosition <= 3 ? 'Top 3 — Excellent!' : ourPosition <= 10 ? 'Page 1 — Good' : ourPosition <= 20 ? 'Page 2 — Needs work' : 'Below page 2'}
          </div>
        </div>
      `;
    } else {
      posCard.innerHTML = `
        <div class="rank-pos-number" style="color:var(--critical)">N/A</div>
        <div class="rank-pos-info">
          <div class="rank-pos-keyword">"${esc(keyword)}"</div>
          <div class="rank-pos-domain">${esc(currentDomain)}</div>
          <div class="rank-pos-label" style="color:var(--critical)">Not found in top ${unique.length} results</div>
        </div>
      `;
    }

    // SERP list
    const serpList = document.getElementById('rankSerp');
    serpList.innerHTML = unique.slice(0, 10).map((r, i) => {
      const isOurs = r.domain === currentDomain || r.domain.endsWith('.' + currentDomain) || currentDomain.endsWith('.' + r.domain);
      return `
        <div class="rank-serp-item ${isOurs ? 'is-ours' : ''}">
          <span class="rank-serp-pos">${i + 1}</span>
          <div class="rank-serp-info">
            <div class="rank-serp-title">${esc(r.title || r.url)}</div>
            <div class="rank-serp-url">${esc(r.domain)}</div>
            ${r.snippet ? `<div class="rank-serp-snippet">${esc(r.snippet.substring(0, 120))}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Load history after checking
    loadRankHistory();

  } catch (err) {
    showToast('Rank check failed: ' + err.message);
    document.getElementById('rankLoading').style.display = 'none';
  }

  btn.disabled = false;
  btn.textContent = 'Check Rank';
}

function saveRankResult(keyword, domain, position, totalResults) {
  chrome.storage.local.get('rank_history', (data) => {
    const history = data.rank_history || {};
    const key = domain + ':' + keyword.toLowerCase();
    if (!history[key]) history[key] = [];
    history[key].unshift({
      keyword,
      domain,
      position,
      totalResults,
      timestamp: Date.now()
    });
    history[key] = history[key].slice(0, 30); // keep last 30 checks per keyword
    chrome.storage.local.set({ rank_history: history });
  });
}

function loadRankHistory() {
  if (!analysisResult) return;
  let currentDomain = '';
  try { currentDomain = new URL(analysisResult.url).hostname; } catch { return; }

  const container = document.getElementById('rankHistory');
  chrome.storage.local.get('rank_history', (data) => {
    const history = data.rank_history || {};
    // Find entries for current domain
    const entries = [];
    for (const [key, checks] of Object.entries(history)) {
      if (key.startsWith(currentDomain + ':')) {
        const keyword = key.substring(currentDomain.length + 1);
        const latest = checks[0];
        const prev = checks.length > 1 ? checks[1] : null;
        const change = prev && latest.position > 0 && prev.position > 0
          ? prev.position - latest.position  // positive = improved
          : null;
        entries.push({ keyword, latest, prev, change, checks });
      }
    }

    if (entries.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    const listEl = document.getElementById('rankHistoryList');
    listEl.innerHTML = entries.sort((a, b) => b.latest.timestamp - a.latest.timestamp).map(e => {
      const pos = e.latest.position > 0 ? `#${e.latest.position}` : 'N/A';
      const posColor = e.latest.position <= 0 ? 'var(--critical)' : e.latest.position <= 3 ? 'var(--pass)' : e.latest.position <= 10 ? 'var(--warning)' : 'var(--critical)';
      let changeHtml = '';
      if (e.change !== null) {
        if (e.change > 0) changeHtml = `<span class="rank-change positive">+${e.change}</span>`;
        else if (e.change < 0) changeHtml = `<span class="rank-change negative">${e.change}</span>`;
        else changeHtml = `<span class="rank-change neutral">=</span>`;
      }
      const date = new Date(e.latest.timestamp).toLocaleDateString();
      return `
        <div class="rank-history-item">
          <div class="rank-history-info">
            <div class="rank-history-keyword">${esc(e.keyword)}</div>
            <div class="rank-history-date">${date} &middot; ${e.checks.length} check${e.checks.length > 1 ? 's' : ''}</div>
          </div>
          <div class="rank-history-pos">
            <span style="color:${posColor};font-weight:700;">${pos}</span>
            ${changeHtml}
          </div>
        </div>
      `;
    }).join('');
  });
}
