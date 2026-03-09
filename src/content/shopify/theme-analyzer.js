/**
 * Shopify Theme Issues Analyzer
 * Detects common Shopify theme SEO problems
 */

import { Category, Severity, createIssue } from '../../shared/types.js';

export function analyzeThemeIssues(doc) {
  const issues = [];
  const data = {};

  // === DUPLICATE SCHEMA (Theme + App conflict) ===
  const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
  const schemaTypes = {};
  jsonLdScripts.forEach(s => {
    try {
      const parsed = JSON.parse(s.textContent);
      const type = parsed['@type'];
      if (type) {
        schemaTypes[type] = (schemaTypes[type] || 0) + 1;
      }
      if (parsed['@graph']) {
        parsed['@graph'].forEach(item => {
          if (item['@type']) {
            schemaTypes[item['@type']] = (schemaTypes[item['@type']] || 0) + 1;
          }
        });
      }
    } catch {}
  });

  for (const [type, count] of Object.entries(schemaTypes)) {
    if (count > 1) {
      issues.push(createIssue('SHOPIFY_THEME_DUPLICATE_SCHEMA', Category.SHOPIFY, Severity.WARNING,
        `Duplicate ${type} schema (${count}x) - likely theme/app conflict`,
        'Having duplicate structured data is a very common Shopify issue caused by both your theme and an app adding the same schema.',
        `Check your theme's code and your installed apps. Remove the duplicate ${type} schema from either the theme or the app.`));
    }
  }

  // === MISSING SKIP-TO-CONTENT ===
  const skipLink = doc.querySelector('a[href="#content"], a[href="#main-content"], a[href="#MainContent"], .skip-to-content');
  if (!skipLink) {
    issues.push(createIssue('SHOPIFY_THEME_NO_SKIP', Category.SHOPIFY, Severity.INFO,
      'No skip-to-content link found',
      'Skip links improve accessibility and are expected by accessibility standards.',
      'Add a skip-to-content link at the top of your theme layout.'));
  }

  // === FOOTER LINKS ===
  const footer = doc.querySelector('footer, .footer, #footer, [data-section-type="footer"]');
  if (footer) {
    const footerLinks = footer.querySelectorAll('a[href]');
    data.footerLinkCount = footerLinks.length;

    if (footerLinks.length < 3) {
      issues.push(createIssue('SHOPIFY_THEME_FEW_FOOTER_LINKS', Category.SHOPIFY, Severity.INFO,
        'Footer has few links',
        'Footer links help search engines discover important pages.',
        'Add links to key pages in your footer: About, Contact, FAQ, shipping policy, return policy, and top collections.'));
    }
  }

  // === BREADCRUMBS ===
  const breadcrumbs = doc.querySelector('.breadcrumb, .breadcrumbs, nav[aria-label*="readcrumb"], [data-breadcrumbs], ol.breadcrumb');
  data.hasBreadcrumbs = !!breadcrumbs;

  if (!breadcrumbs && window.location.pathname !== '/') {
    issues.push(createIssue('SHOPIFY_THEME_NO_BREADCRUMBS', Category.SHOPIFY, Severity.WARNING,
      'No breadcrumb navigation found',
      'Breadcrumbs help users navigate and enable breadcrumb rich results in Google.',
      'Add breadcrumb navigation to your theme. Also add BreadcrumbList structured data.'));
  }

  // === SEARCH FUNCTIONALITY ===
  const searchForm = doc.querySelector('form[action="/search"], input[name="q"][type="search"], .search-form');
  data.hasSearch = !!searchForm;

  if (!searchForm) {
    issues.push(createIssue('SHOPIFY_THEME_NO_SEARCH', Category.SHOPIFY, Severity.INFO,
      'No search functionality detected',
      'Site search helps users find products and can be enhanced with Google\'s sitelinks search box.',
      'Ensure your theme includes a search form. Add WebSite schema with SearchAction for sitelinks.'));
  }

  // === SOCIAL LINKS ===
  const socialLinks = doc.querySelectorAll('a[href*="facebook.com"], a[href*="instagram.com"], a[href*="twitter.com"], a[href*="tiktok.com"], a[href*="pinterest.com"], a[href*="youtube.com"]');
  data.socialLinkCount = socialLinks.length;

  if (socialLinks.length === 0) {
    issues.push(createIssue('SHOPIFY_THEME_NO_SOCIAL', Category.SHOPIFY, Severity.INFO,
      'No social media links found',
      'Social links help establish your brand presence and can be included in Organization schema.',
      'Add links to your social media profiles in the footer or header.'));
  }

  // === LAZY-LOADED ABOVE-FOLD CONTENT ===
  const firstImages = Array.from(doc.querySelectorAll('img')).slice(0, 3);
  const lazyAboveFold = firstImages.filter(img =>
    img.getAttribute('loading') === 'lazy' || img.classList.contains('lazyload')
  );

  if (lazyAboveFold.length > 0) {
    issues.push(createIssue('SHOPIFY_THEME_LAZY_HERO', Category.SHOPIFY, Severity.WARNING,
      `${lazyAboveFold.length} above-fold image(s) are lazy-loaded`,
      'Lazy-loading above-fold images delays Largest Contentful Paint (LCP).',
      'Remove loading="lazy" from hero/banner images. Only lazy-load images below the fold.'));
  }

  // === APP BLOAT DETECTION ===
  const scripts = doc.querySelectorAll('script[src]');
  const appScripts = Array.from(scripts).filter(s => {
    const src = s.getAttribute('src') || '';
    return src.includes('apps.shopify.com') || src.includes('shopifyapps') ||
      src.includes('app-proxy') || (src.includes('.js') && src.includes('/apps/'));
  });
  data.appScriptCount = appScripts.length;

  if (appScripts.length > 5) {
    issues.push(createIssue('SHOPIFY_THEME_APP_BLOAT', Category.SHOPIFY, Severity.WARNING,
      `${appScripts.length} app scripts detected`,
      'Too many Shopify apps loading scripts can significantly slow down your store.',
      'Audit your installed apps. Remove or replace apps that add heavy scripts. Consider if apps are necessary on all pages.'));
  }

  return { issues, data };
}
