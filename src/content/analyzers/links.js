/**
 * Links Analyzer
 * Audits internal/external links, nofollow, broken link indicators
 */

import { Category, Severity, createIssue } from '../../shared/types.js';

export function analyzeLinks(doc, url) {
  const issues = [];
  const data = {};

  const links = Array.from(doc.querySelectorAll('a[href]'));
  const currentHost = new URL(url).hostname;

  let internal = 0;
  let external = 0;
  let nofollow = 0;
  let emptyAnchors = 0;
  let hashLinks = 0;
  let brokenIndicators = 0;
  const externalDomains = new Set();

  const linkDetails = [];

  links.forEach(link => {
    const href = link.getAttribute('href') || '';
    const text = link.textContent?.trim() || '';
    const rel = link.getAttribute('rel') || '';
    const isNofollow = rel.includes('nofollow');
    const title = link.getAttribute('title') || '';

    let type = 'internal';

    try {
      if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
        const linkHost = new URL(href, url).hostname;
        if (linkHost !== currentHost) {
          type = 'external';
          external++;
          externalDomains.add(linkHost);
        } else {
          internal++;
        }
      } else if (href.startsWith('#')) {
        type = 'hash';
        hashLinks++;
      } else if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
        type = 'special';
      } else {
        internal++;
      }
    } catch {
      internal++;
    }

    if (isNofollow) nofollow++;
    if (!text && !title && !link.querySelector('img')) emptyAnchors++;

    // Check for common broken link patterns
    if (href === '#' || href === '' || href === 'javascript:void(0)') {
      brokenIndicators++;
    }

    linkDetails.push({
      href: href.substring(0, 200),
      text: text.substring(0, 100),
      type,
      isNofollow,
      hasText: !!text || !!title || !!link.querySelector('img')
    });
  });

  data.totalLinks = links.length;
  data.internal = internal;
  data.external = external;
  data.nofollow = nofollow;
  data.emptyAnchors = emptyAnchors;
  data.hashLinks = hashLinks;
  data.externalDomains = Array.from(externalDomains);
  data.linkDetails = linkDetails.slice(0, 200); // Limit stored details

  // === INTERNAL LINKS ===
  if (internal < 3) {
    issues.push(createIssue('LINKS_INTERNAL_LOW', Category.LINKS, Severity.WARNING,
      `Only ${internal} internal links found`,
      'Internal links help search engines discover and understand your site structure.',
      'Add more internal links to related products, collections, or content pages.'));
  } else {
    issues.push(createIssue('LINKS_INTERNAL_OK', Category.LINKS, Severity.PASS,
      `${internal} internal links found`, '', ''));
  }

  // === EMPTY ANCHORS ===
  if (emptyAnchors > 0) {
    issues.push(createIssue('LINKS_EMPTY_ANCHOR', Category.LINKS, Severity.WARNING,
      `${emptyAnchors} link(s) with no anchor text`,
      'Links without text provide no context to search engines about the destination page.',
      'Add descriptive anchor text to all links. Use keyword-rich but natural text.'));
  }

  // === BROKEN INDICATORS ===
  if (brokenIndicators > 3) {
    issues.push(createIssue('LINKS_BROKEN_INDICATORS', Category.LINKS, Severity.INFO,
      `${brokenIndicators} placeholder/empty links detected`,
      'Links pointing to "#" or "javascript:void(0)" provide no SEO value.',
      'Replace placeholder links with actual URLs or remove them if unnecessary.'));
  }

  // === EXTERNAL LINKS ===
  if (external > 0 && nofollow === external) {
    issues.push(createIssue('LINKS_ALL_NOFOLLOW', Category.LINKS, Severity.INFO,
      'All external links are nofollow',
      'While it\'s fine to nofollow untrusted links, having some followed external links to authoritative sources can build trust.',
      'Consider removing nofollow from links to authoritative, relevant external sources.'));
  }

  // === LINK DIVERSITY ===
  if (links.length > 20 && external === 0) {
    issues.push(createIssue('LINKS_NO_EXTERNAL', Category.LINKS, Severity.INFO,
      'No external links found',
      'Pages that link to relevant, authoritative external sources can signal topical relevance.',
      'Consider adding links to relevant, authoritative external resources where appropriate.'));
  }

  return { issues, data };
}
