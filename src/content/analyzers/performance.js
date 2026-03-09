/**
 * Performance Analyzer
 * DOM size, render-blocking resources, lazy loading, Core Web Vitals hints
 */

import { Category, Severity, createIssue } from '../../shared/types.js';

export function analyzePerformance(doc) {
  const issues = [];
  const data = {};

  // === DOM SIZE ===
  const allElements = doc.querySelectorAll('*');
  data.domElements = allElements.length;

  if (allElements.length > 3000) {
    issues.push(createIssue('DOM_TOO_LARGE', Category.PERFORMANCE, Severity.WARNING,
      `Large DOM: ${allElements.length} elements`,
      'A large DOM increases memory usage, slows style recalculations, and hurts interaction responsiveness.',
      'Simplify your page structure. Remove hidden elements, reduce nesting depth, and consider pagination.'));
  } else if (allElements.length > 1500) {
    issues.push(createIssue('DOM_MODERATE', Category.PERFORMANCE, Severity.INFO,
      `Moderate DOM size: ${allElements.length} elements`,
      'The DOM size is acceptable but could be optimized.',
      'Review your page for unnecessary wrapper elements or hidden content.'));
  } else {
    issues.push(createIssue('DOM_OK', Category.PERFORMANCE, Severity.PASS,
      `Good DOM size: ${allElements.length} elements`, '', ''));
  }

  // === DOM DEPTH ===
  let maxDepth = 0;
  function getDepth(el, depth) {
    if (depth > maxDepth) maxDepth = depth;
    if (depth < 32) { // Safety limit
      for (const child of el.children) {
        getDepth(child, depth + 1);
      }
    }
  }
  getDepth(doc.documentElement, 0);
  data.maxDomDepth = maxDepth;

  if (maxDepth > 15) {
    issues.push(createIssue('DOM_DEEP', Category.PERFORMANCE, Severity.WARNING,
      `Deep DOM nesting: ${maxDepth} levels`,
      'Deeply nested DOM trees slow down CSS selector matching and layout calculations.',
      'Flatten your HTML structure. Reduce unnecessary wrapper elements.'));
  }

  // === RENDER-BLOCKING RESOURCES ===
  const blockingCSS = doc.querySelectorAll('link[rel="stylesheet"]:not([media="print"]):not([disabled])');
  const blockingJS = doc.querySelectorAll('script[src]:not([async]):not([defer]):not([type="module"])');

  data.blockingCSS = blockingCSS.length;
  data.blockingJS = blockingJS.length;

  if (blockingCSS.length > 5) {
    issues.push(createIssue('RENDER_BLOCKING_CSS', Category.PERFORMANCE, Severity.WARNING,
      `${blockingCSS.length} render-blocking CSS files`,
      'Multiple blocking CSS files delay First Contentful Paint.',
      'Combine CSS files, inline critical CSS, or use media queries to defer non-essential styles.'));
  }

  if (blockingJS.length > 5) {
    issues.push(createIssue('RENDER_BLOCKING_JS', Category.PERFORMANCE, Severity.WARNING,
      `${blockingJS.length} render-blocking JavaScript files`,
      'Blocking scripts prevent the page from rendering until they load and execute.',
      'Add async or defer attributes to non-critical scripts. Move scripts to the end of <body>.'));
  }

  // === TOTAL SCRIPTS ===
  const allScripts = doc.querySelectorAll('script[src]');
  data.totalScripts = allScripts.length;

  if (allScripts.length > 20) {
    issues.push(createIssue('TOO_MANY_SCRIPTS', Category.PERFORMANCE, Severity.WARNING,
      `${allScripts.length} external scripts loaded`,
      'Many scripts increase load time, especially from third-party apps.',
      'Audit your Shopify apps. Remove unused apps and scripts. Consider app alternatives that are lighter.'));
  }

  // === TOTAL STYLESHEETS ===
  const allStyles = doc.querySelectorAll('link[rel="stylesheet"]');
  data.totalStylesheets = allStyles.length;

  // === INLINE STYLES ===
  const inlineStyles = doc.querySelectorAll('[style]');
  data.inlineStyles = inlineStyles.length;

  if (inlineStyles.length > 50) {
    issues.push(createIssue('TOO_MANY_INLINE_STYLES', Category.PERFORMANCE, Severity.INFO,
      `${inlineStyles.length} elements with inline styles`,
      'Excessive inline styles increase HTML size and prevent caching.',
      'Move inline styles to CSS classes where possible.'));
  }

  // === IFRAMES ===
  const iframes = doc.querySelectorAll('iframe');
  data.iframeCount = iframes.length;

  if (iframes.length > 3) {
    issues.push(createIssue('TOO_MANY_IFRAMES', Category.PERFORMANCE, Severity.WARNING,
      `${iframes.length} iframes found`,
      'Each iframe creates a separate browsing context, consuming memory and CPU.',
      'Minimize iframe usage. Lazy-load non-critical iframes.'));
  }

  // === THIRD-PARTY SCRIPTS ===
  const thirdParty = Array.from(allScripts).filter(s => {
    try {
      const scriptUrl = new URL(s.src, doc.location?.href || 'https://example.com');
      return scriptUrl.hostname !== (doc.location?.hostname || '');
    } catch { return false; }
  });
  data.thirdPartyScripts = thirdParty.length;

  if (thirdParty.length > 10) {
    issues.push(createIssue('TOO_MANY_THIRD_PARTY', Category.PERFORMANCE, Severity.WARNING,
      `${thirdParty.length} third-party scripts detected`,
      'Third-party scripts are a common cause of slow page loads in Shopify stores.',
      'Review your installed apps and tracking scripts. Remove any that are not essential.'));
  }

  return { issues, data };
}
