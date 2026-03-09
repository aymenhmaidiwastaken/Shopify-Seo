/**
 * Shopify Detection
 * Multi-signal fingerprinting to determine if a site is running Shopify
 */

export function detectShopify(doc) {
  let score = 0;
  const signals = [];

  // Signal 1: window.Shopify global (checked via meta/script indicators since content scripts can't access page JS directly)
  const shopifyScripts = doc.querySelectorAll('script');
  let hasShopifyGlobal = false;
  shopifyScripts.forEach(s => {
    const text = s.textContent || '';
    if (text.includes('Shopify.') || text.includes('window.Shopify')) {
      hasShopifyGlobal = true;
    }
  });
  if (hasShopifyGlobal) {
    score += 0.35;
    signals.push('Shopify JS global detected');
  }

  // Signal 2: CDN references
  const allElements = doc.querySelectorAll('link[href], script[src], img[src]');
  let hasCDN = false;
  allElements.forEach(el => {
    const src = el.getAttribute('href') || el.getAttribute('src') || '';
    if (src.includes('cdn.shopify.com') || src.includes('cdn.shopifycdn.net')) {
      hasCDN = true;
    }
  });
  if (hasCDN) {
    score += 0.25;
    signals.push('Shopify CDN detected');
  }

  // Signal 3: Shopify-specific meta tags
  const shopifyMeta = doc.querySelector('meta[name="shopify-checkout-api-token"]') ||
    doc.querySelector('meta[name="shopify-digital-wallet"]') ||
    doc.querySelector('meta[property="og:site_name"][content]');
  if (shopifyMeta) {
    score += 0.10;
    signals.push('Shopify meta tags found');
  }

  // Signal 4: Cart form
  const cartForm = doc.querySelector('form[action*="/cart"]') ||
    doc.querySelector('form[action*="/cart/add"]');
  if (cartForm) {
    score += 0.10;
    signals.push('/cart form action found');
  }

  // Signal 5: Shopify-specific CSS classes
  const shopifyClasses = doc.querySelector('.shopify-section') ||
    doc.querySelector('[data-shopify]') ||
    doc.querySelector('.shopify-payment-button');
  if (shopifyClasses) {
    score += 0.10;
    signals.push('Shopify CSS classes found');
  }

  // Signal 6: myshopify.com in links
  const myshopifyLink = doc.querySelector('a[href*="myshopify.com"]') ||
    doc.querySelector('link[href*="myshopify.com"]');
  if (myshopifyLink) {
    score += 0.10;
    signals.push('myshopify.com reference found');
  }

  const isShopify = score >= 0.4;

  // Detect page type
  let pageType = 'other';
  const path = window.location.pathname;

  if (path === '/' || path === '') {
    pageType = 'homepage';
  } else if (path.match(/^\/products\/[^/]+/)) {
    pageType = 'product';
  } else if (path.match(/^\/collections\/[^/]+/) && !path.includes('/products/')) {
    pageType = 'collection';
  } else if (path.match(/^\/blogs\//)) {
    pageType = 'blog';
  } else if (path.match(/^\/pages\//)) {
    pageType = 'page';
  } else if (path === '/collections' || path === '/collections/') {
    pageType = 'collections-list';
  } else if (path === '/cart' || path === '/cart/') {
    pageType = 'cart';
  } else if (path.includes('/search')) {
    pageType = 'search';
  }

  return {
    isShopify,
    confidence: Math.round(score * 100),
    signals,
    pageType
  };
}
