/**
 * Technical SEO Analyzer
 * Checks canonical, robots, sitemap, URL structure
 */

import { Category, Severity, createIssue } from '../../shared/types.js';

export function analyzeTechnical(doc, url) {
  const issues = [];
  const data = {};

  const parsedUrl = new URL(url);

  // === CANONICAL TAG ===
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
  data.canonical = canonical;

  if (!canonical) {
    issues.push(createIssue('CANONICAL_MISSING', Category.TECHNICAL, Severity.CRITICAL,
      'Missing canonical tag',
      'Without a canonical tag, search engines may index duplicate versions of this page.',
      'Add <link rel="canonical" href="[preferred URL]"> to the <head>.'));
  } else {
    try {
      const canonicalUrl = new URL(canonical, url);
      if (canonicalUrl.href !== parsedUrl.href && canonicalUrl.pathname !== parsedUrl.pathname) {
        issues.push(createIssue('CANONICAL_DIFFERENT', Category.TECHNICAL, Severity.INFO,
          'Canonical points to a different URL',
          `This page canonicalizes to: ${canonical}. This may be intentional (e.g., variant pages).`,
          'Verify the canonical URL is correct. Ensure it points to the preferred version of this content.'));
      } else {
        issues.push(createIssue('CANONICAL_OK', Category.TECHNICAL, Severity.PASS,
          'Canonical tag is self-referencing', '', ''));
      }
    } catch {
      issues.push(createIssue('CANONICAL_INVALID', Category.TECHNICAL, Severity.WARNING,
        'Canonical tag has an invalid URL',
        `The canonical value "${canonical}" is not a valid URL.`,
        'Fix the canonical tag to contain a valid, absolute URL.'));
    }
  }

  // === ROBOTS META ===
  const robotsMeta = doc.querySelector('meta[name="robots"]')?.getAttribute('content') || '';
  data.robotsMeta = robotsMeta;

  if (robotsMeta.includes('noindex')) {
    issues.push(createIssue('ROBOTS_NOINDEX', Category.TECHNICAL, Severity.CRITICAL,
      'Page is set to noindex',
      'This page will NOT be indexed by search engines. If this is intentional (e.g., admin pages), this is fine.',
      'Remove noindex from the robots meta tag if you want this page to appear in search results.'));
  }

  if (robotsMeta.includes('nofollow')) {
    issues.push(createIssue('ROBOTS_NOFOLLOW', Category.TECHNICAL, Severity.WARNING,
      'Page is set to nofollow',
      'Search engines will not follow links on this page, preventing link equity flow.',
      'Remove nofollow if you want search engines to follow and value links on this page.'));
  }

  // === URL STRUCTURE ===
  const pathname = parsedUrl.pathname;
  data.urlPath = pathname;
  data.urlLength = url.length;

  if (url.length > 115) {
    issues.push(createIssue('URL_LONG', Category.TECHNICAL, Severity.INFO,
      `URL is long (${url.length} characters)`,
      'Shorter URLs tend to perform better in search results and are easier to share.',
      'Keep URLs under 115 characters. Use short, descriptive handles.'));
  }

  if (pathname.match(/[A-Z]/)) {
    issues.push(createIssue('URL_UPPERCASE', Category.TECHNICAL, Severity.WARNING,
      'URL contains uppercase characters',
      'URLs are case-sensitive. Uppercase URLs can cause duplicate content if both versions are accessible.',
      'Use lowercase-only URLs. Set up redirects from uppercase versions.'));
  }

  if (pathname.match(/_/)) {
    issues.push(createIssue('URL_UNDERSCORES', Category.TECHNICAL, Severity.INFO,
      'URL contains underscores',
      'Google treats underscores as word joiners, not separators. Use hyphens instead.',
      'Replace underscores with hyphens in your URL handles.'));
  }

  const params = parsedUrl.searchParams;
  const paramCount = Array.from(params.keys()).length;
  if (paramCount > 2) {
    issues.push(createIssue('URL_MANY_PARAMS', Category.TECHNICAL, Severity.INFO,
      `URL has ${paramCount} query parameters`,
      'URLs with many parameters can look spammy and may cause duplicate content issues.',
      'Minimize query parameters. Use canonical tags to consolidate parameterized URLs.'));
  }

  // === HREFLANG ===
  const hreflangs = doc.querySelectorAll('link[rel="alternate"][hreflang]');
  data.hreflangs = Array.from(hreflangs).map(h => ({
    lang: h.getAttribute('hreflang'),
    href: h.getAttribute('href')
  }));

  // === FAVICON ===
  const favicon = doc.querySelector('link[rel="icon"]') || doc.querySelector('link[rel="shortcut icon"]');
  if (!favicon) {
    issues.push(createIssue('FAVICON_MISSING', Category.TECHNICAL, Severity.INFO,
      'No favicon detected',
      'Favicons appear in browser tabs and search results. They improve brand recognition.',
      'Add a favicon to your store in Shopify Admin > Online Store > Themes > Customize.'));
  }

  // === HTTPS ===
  if (parsedUrl.protocol !== 'https:') {
    issues.push(createIssue('NOT_HTTPS', Category.TECHNICAL, Severity.CRITICAL,
      'Page is not served over HTTPS',
      'HTTPS is a ranking signal. Non-HTTPS sites are marked as "Not Secure" by browsers.',
      'Enable HTTPS for your domain. Shopify provides free SSL certificates.'));
  } else {
    issues.push(createIssue('HTTPS_OK', Category.TECHNICAL, Severity.PASS,
      'Page is served over HTTPS', '', ''));
  }

  return { issues, data };
}
