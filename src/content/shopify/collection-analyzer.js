/**
 * Shopify Collection Page Analyzer
 */

import { Category, Severity, createIssue } from '../../shared/types.js';

export function analyzeCollectionPage(doc, url) {
  const issues = [];
  const data = {};

  // === COLLECTION DESCRIPTION ===
  const descEl = doc.querySelector('.collection-description, .collection__description, [data-collection-description], .rte');
  const descText = descEl?.textContent?.trim() || '';
  data.collectionDescription = descText.substring(0, 500);
  data.hasDescription = descText.length > 0;

  if (!descText) {
    issues.push(createIssue('SHOPIFY_COLL_NO_DESC', Category.SHOPIFY, Severity.CRITICAL,
      'Collection has no description',
      'Collection descriptions are crucial for ranking collection pages. Without unique content, these pages are thin.',
      'Add a 100+ word description in Shopify Admin > Products > Collections. Include target keywords naturally.'));
  } else if (descText.split(/\s+/).length < 50) {
    issues.push(createIssue('SHOPIFY_COLL_SHORT_DESC', Category.SHOPIFY, Severity.WARNING,
      'Collection description is short',
      'Short collection descriptions provide limited SEO value.',
      'Expand to 100+ words. Describe what the collection contains, who it\'s for, and why it matters.'));
  }

  // === PRODUCT COUNT ===
  const products = doc.querySelectorAll('.product-card, .grid-product, .product-item, [data-product-card], .product-grid-item, .collection-product-card');
  data.productCount = products.length;

  if (products.length === 0) {
    issues.push(createIssue('SHOPIFY_COLL_EMPTY', Category.SHOPIFY, Severity.WARNING,
      'No products found on collection page',
      'Empty collections provide no value and may be marked as thin content.',
      'Add products to this collection or add a noindex tag if it\'s intentionally empty.'));
  }

  // === PAGINATION ===
  const pagination = doc.querySelector('.pagination, nav[role="navigation"] a[href*="page="]');
  const urlObj = new URL(url);
  const currentPage = urlObj.searchParams.get('page');
  data.hasPagination = !!pagination;
  data.currentPage = currentPage;

  if (currentPage && parseInt(currentPage) > 1) {
    const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
    if (canonical.includes('page=')) {
      issues.push(createIssue('SHOPIFY_COLL_PAGINATED_CANONICAL', Category.SHOPIFY, Severity.WARNING,
        'Paginated page has unique canonical',
        'Paginated collection pages should either canonical to page 1 or use self-referencing canonicals with proper rel=next/prev.',
        'Ensure your theme handles pagination canonicals correctly.'));
    }
  }

  // === COLLECTION FILTERS / TAG PAGES ===
  const path = window.location.pathname;
  const tagMatch = path.match(/\/collections\/[^/]+\/([^/]+)/);
  if (tagMatch) {
    data.isTagPage = true;
    data.tag = tagMatch[1];

    const robotsMeta = doc.querySelector('meta[name="robots"]')?.getAttribute('content') || '';
    if (!robotsMeta.includes('noindex')) {
      issues.push(createIssue('SHOPIFY_TAG_PAGE_INDEXED', Category.SHOPIFY, Severity.WARNING,
        `Tag/filter page "${tagMatch[1]}" is indexable`,
        'Shopify tag URLs (/collections/name/tag) often create duplicate content.',
        'Add noindex to tag pages, or ensure each tag page has unique content and a self-referencing canonical.'));
    }
  }

  // === /collections/all ===
  if (path.includes('/collections/all')) {
    issues.push(createIssue('SHOPIFY_COLLECTIONS_ALL', Category.SHOPIFY, Severity.WARNING,
      'This is the /collections/all page',
      'The /collections/all page often duplicates other collection pages and is a common SEO issue.',
      'Consider adding noindex to /collections/all or ensuring it has a unique purpose and canonical.'));
  }

  return { issues, data };
}
