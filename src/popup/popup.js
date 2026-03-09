/**
 * Popup Script
 * Controls the popup UI, triggers analysis, and displays results
 */

const GRADE_MAP = {
  95: 'A+', 90: 'A', 85: 'B+', 80: 'B', 75: 'C+', 70: 'C', 60: 'D', 0: 'F'
};

const CATEGORY_LABELS = {
  meta: 'Meta & Social',
  content: 'Content',
  technical: 'Technical',
  images: 'Images',
  links: 'Links',
  performance: 'Performance',
  shopify: 'Shopify'
};

const COLOR_MAP = {
  90: '#22c55e',
  70: '#eab308',
  50: '#f97316',
  0: '#ef4444'
};

document.addEventListener('DOMContentLoaded', () => {
  const loadingState = document.getElementById('loadingState');
  const initialState = document.getElementById('initialState');
  const resultsState = document.getElementById('resultsState');
  const errorState = document.getElementById('errorState');

  let currentResult = null;

  function showState(state) {
    [loadingState, initialState, resultsState, errorState].forEach(s => s.style.display = 'none');
    state.style.display = state === resultsState ? 'block' : 'flex';
  }

  function getScoreColor(score) {
    for (const [threshold, color] of Object.entries(COLOR_MAP).sort((a, b) => b[0] - a[0])) {
      if (score >= parseInt(threshold)) return color;
    }
    return '#ef4444';
  }

  function getGrade(score) {
    for (const [threshold, grade] of Object.entries(GRADE_MAP).sort((a, b) => b[0] - a[0])) {
      if (score >= parseInt(threshold)) return grade;
    }
    return 'F';
  }

  function animateScore(targetScore) {
    const scoreEl = document.getElementById('scoreValue');
    const gradeEl = document.getElementById('scoreGrade');
    const gaugeArc = document.getElementById('gaugeArc');
    const circumference = 2 * Math.PI * 52; // r=52

    const color = getScoreColor(targetScore);
    gaugeArc.style.stroke = color;
    scoreEl.style.color = color;

    // Animate number
    let current = 0;
    const duration = 1200;
    const startTime = performance.now();

    function animate(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic

      current = Math.round(eased * targetScore);
      scoreEl.textContent = current;

      // Update arc
      const offset = circumference - (eased * targetScore / 100) * circumference;
      gaugeArc.style.strokeDashoffset = offset;

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        gradeEl.textContent = getGrade(targetScore);
        gradeEl.style.color = color;
      }
    }

    requestAnimationFrame(animate);
  }

  function renderResults(result) {
    currentResult = result;
    showState(resultsState);

    // Shopify badge
    const badge = document.getElementById('shopifyBadge');
    const badgeText = document.getElementById('shopifyBadgeText');
    badge.style.display = 'flex';

    if (result.isShopify) {
      badge.className = 'badge shopify-badge';
      badgeText.textContent = `Shopify Store (${result.shopifyConfidence}% confidence)`;
    } else {
      badge.className = 'badge shopify-badge not-shopify-badge';
      badgeText.textContent = 'Not a Shopify Store';
    }

    // Page type
    const pageTypeLabel = document.getElementById('pageTypeLabel');
    if (result.isShopify && result.pageType && result.pageType !== 'other') {
      pageTypeLabel.textContent = result.pageType.replace('-', ' ') + ' page';
    } else {
      pageTypeLabel.textContent = '';
    }

    // Score animation
    animateScore(result.overallScore);

    // Issue counts
    document.getElementById('criticalCount').textContent = result.issueCount.critical;
    document.getElementById('warningCount').textContent = result.issueCount.warning;
    document.getElementById('infoCount').textContent = result.issueCount.info;
    document.getElementById('passCount').textContent = result.issueCount.pass;

    // Category scores
    const catContainer = document.getElementById('categoryScores');
    catContainer.innerHTML = '';

    const categories = Object.entries(result.categoryScores)
      .filter(([cat]) => result.isShopify || cat !== 'shopify');

    categories.forEach(([cat, score]) => {
      const color = getScoreColor(score);
      const div = document.createElement('div');
      div.className = 'cat-score';
      div.innerHTML = `
        <span class="cat-label">${CATEGORY_LABELS[cat] || cat}</span>
        <div class="cat-bar">
          <div class="cat-bar-fill" style="width: ${score}%; background: ${color};"></div>
        </div>
        <span class="cat-value" style="color: ${color}">${score}</span>
      `;
      catContainer.appendChild(div);
    });

    // Top issues (non-pass, sorted by severity)
    const topIssues = result.issues
      .filter(i => i.severity !== 'pass')
      .sort((a, b) => {
        const order = { critical: 0, warning: 1, info: 2 };
        return (order[a.severity] || 3) - (order[b.severity] || 3);
      })
      .slice(0, 5);

    const issuesList = document.getElementById('topIssuesList');
    issuesList.innerHTML = '';

    if (topIssues.length === 0) {
      issuesList.innerHTML = `
        <div class="issue-item" style="justify-content: center; color: var(--pass); border-left-color: var(--pass);">
          All checks passed! Great job!
        </div>
      `;
    } else {
      topIssues.forEach(issue => {
        const div = document.createElement('div');
        div.className = `issue-item ${issue.severity}`;
        div.innerHTML = `
          <div class="issue-severity ${issue.severity}"></div>
          <span class="issue-title">${issue.title}</span>
        `;
        issuesList.appendChild(div);
      });
    }

    // Save report to history
    chrome.runtime.sendMessage({
      type: 'SAVE_REPORT',
      report: {
        url: result.url,
        overallScore: result.overallScore,
        categoryScores: result.categoryScores,
        issueCount: result.issueCount,
        isShopify: result.isShopify,
        pageType: result.pageType
      }
    });
  }

  function runAnalysis() {
    showState(loadingState);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        showError('No active tab found.');
        return;
      }

      chrome.tabs.sendMessage(tabs[0].id, { type: 'ANALYZE_PAGE' }, (response) => {
        if (chrome.runtime.lastError) {
          showError('Cannot analyze this page. Make sure you\'re on a website (not a browser internal page).');
          return;
        }

        if (response?.error) {
          showError(response.error);
          return;
        }

        if (response) {
          renderResults(response);
        } else {
          showError('No response from content script. Try refreshing the page.');
        }
      });
    });
  }

  function showError(message) {
    showState(errorState);
    document.getElementById('errorMessage').textContent = message;
  }

  // Event listeners
  document.getElementById('analyzeBtn').addEventListener('click', runAnalysis);
  document.getElementById('retryBtn').addEventListener('click', runAnalysis);
  document.getElementById('reanalyzeBtn')?.addEventListener('click', runAnalysis);

  document.getElementById('openPanelBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' });
  });

  document.getElementById('exportCSVBtn').addEventListener('click', () => {
    if (!currentResult) return;

    chrome.runtime.sendMessage({
      type: 'EXPORT_CSV',
      issues: currentResult.issues
    }, (response) => {
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
  });

  // Auto-analyze on open: first check for cached result
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      showState(initialState);
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_CACHED_RESULT' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        // Show initial state - let user click to analyze
        showState(initialState);
        return;
      }
      renderResults(response);
    });
  });
});
