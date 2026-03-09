/**
 * Content Script - Main entry point (self-contained, no ES modules)
 * Runs on every page, detects Shopify, and performs analysis on demand
 */

(function() {
  'use strict';

  // ============================================================
  // CONSTANTS
  // ============================================================
  const Severity = { CRITICAL: 'critical', WARNING: 'warning', INFO: 'info', PASS: 'pass' };
  const Category = {
    META: 'meta', CONTENT: 'content', TECHNICAL: 'technical',
    IMAGES: 'images', LINKS: 'links', PERFORMANCE: 'performance', SHOPIFY: 'shopify'
  };

  function issue(id, cat, sev, title, desc, rec, codeSnippet) {
    return { id, category: cat, severity: sev, title, description: desc, recommendation: rec, codeSnippet: codeSnippet || null };
  }

  // ============================================================
  // SHOPIFY DETECTOR
  // ============================================================
  function detectShopify(doc) {
    let score = 0;
    const signals = [];

    // Script content checks
    const scripts = doc.querySelectorAll('script');
    let hasShopifyGlobal = false;
    scripts.forEach(s => {
      const t = s.textContent || '';
      if (t.includes('Shopify.') || t.includes('window.Shopify')) hasShopifyGlobal = true;
    });
    if (hasShopifyGlobal) { score += 0.35; signals.push('Shopify JS global'); }

    // CDN
    let hasCDN = false;
    doc.querySelectorAll('link[href], script[src], img[src]').forEach(el => {
      const src = el.getAttribute('href') || el.getAttribute('src') || '';
      if (src.includes('cdn.shopify.com') || src.includes('cdn.shopifycdn.net')) hasCDN = true;
    });
    if (hasCDN) { score += 0.25; signals.push('Shopify CDN'); }

    // Meta tags
    if (doc.querySelector('meta[name="shopify-checkout-api-token"]') ||
        doc.querySelector('meta[name="shopify-digital-wallet"]')) {
      score += 0.10; signals.push('Shopify meta tags');
    }

    // Cart form
    if (doc.querySelector('form[action*="/cart"]')) {
      score += 0.10; signals.push('/cart form');
    }

    // CSS classes
    if (doc.querySelector('.shopify-section') || doc.querySelector('[data-shopify]') ||
        doc.querySelector('.shopify-payment-button')) {
      score += 0.10; signals.push('Shopify classes');
    }

    // myshopify.com
    if (doc.querySelector('a[href*="myshopify.com"]') || doc.querySelector('link[href*="myshopify.com"]')) {
      score += 0.10; signals.push('myshopify.com ref');
    }

    const isShopify = score >= 0.4;
    let pageType = 'other';
    let path;
    try { path = new URL(doc.URL || doc.baseURI || '').pathname; } catch { path = '/'; }
    try { if (typeof window !== 'undefined') path = window.location.pathname; } catch {}

    if (path === '/' || path === '') pageType = 'homepage';
    else if (path.match(/^\/products\/[^/]+/)) pageType = 'product';
    else if (path.match(/^\/collections\/[^/]+/) && !path.includes('/products/')) pageType = 'collection';
    else if (path.match(/^\/blogs\//)) pageType = 'blog';
    else if (path.match(/^\/pages\//)) pageType = 'page';
    else if (path === '/collections' || path === '/collections/') pageType = 'collections-list';
    else if (path === '/cart' || path === '/cart/') pageType = 'cart';
    else if (path.includes('/search')) pageType = 'search';

    return { isShopify, confidence: Math.round(score * 100), signals, pageType };
  }

  // ============================================================
  // META TAGS ANALYZER
  // ============================================================
  function analyzeMetaTags(doc, url) {
    const issues = [];
    const data = {};

    const title = doc.querySelector('title')?.textContent?.trim() || '';
    data.title = title;
    data.titleLength = title.length;

    if (!title) {
      issues.push(issue('META_TITLE_MISSING', Category.META, Severity.CRITICAL, 'Missing page title',
        'The page has no <title> tag. This is the most important on-page SEO element.',
        'Add a unique, descriptive <title> tag between 50-60 characters that includes your target keyword.',
        '<title>Your Product Name | Your Store Name</title>'));
    } else if (title.length < 30) {
      issues.push(issue('META_TITLE_SHORT', Category.META, Severity.WARNING, `Title too short (${title.length} chars)`,
        'Short titles miss opportunities to include keywords and attract clicks.', 'Expand your title to 50-60 characters.',
        '<!-- In theme.liquid or relevant template -->\n<title>{{ page_title }} | {{ shop.name }}</title>'));
    } else if (title.length > 60) {
      issues.push(issue('META_TITLE_LONG', Category.META, Severity.WARNING, `Title too long (${title.length} chars)`,
        'Titles over 60 characters get truncated in search results.', 'Shorten your title to 50-60 characters.',
        '<!-- Keep under 60 chars -->\n<title>{{ page_title | truncate: 55 }} | {{ shop.name }}</title>'));
    } else {
      issues.push(issue('META_TITLE_OK', Category.META, Severity.PASS, 'Title tag is well-optimized', '', ''));
    }

    const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';
    data.metaDescription = metaDesc;
    data.metaDescriptionLength = metaDesc.length;

    if (!metaDesc) {
      issues.push(issue('META_DESC_MISSING', Category.META, Severity.CRITICAL, 'Missing meta description',
        'No meta description found. Google may generate one automatically.', 'Add a compelling meta description (150-160 chars) with keywords.',
        '<meta name="description" content="{{ page_description | escape }}">'));
    } else if (metaDesc.length < 120) {
      issues.push(issue('META_DESC_SHORT', Category.META, Severity.WARNING, `Meta description too short (${metaDesc.length} chars)`,
        'Short descriptions don\'t fully utilize search result space.', 'Expand to 150-160 characters.',
        '{%- capture meta_desc -%}\n  {{ page_description | default: product.description | strip_html | truncatewords: 30 }}\n{%- endcapture -%}\n<meta name="description" content="{{ meta_desc | escape }}">'));
    } else if (metaDesc.length > 160) {
      issues.push(issue('META_DESC_LONG', Category.META, Severity.WARNING, `Meta description too long (${metaDesc.length} chars)`,
        'Descriptions over 160 characters get truncated.', 'Trim to 150-160 characters.',
        '{%- capture meta_desc -%}\n  {{ page_description | strip_html | truncate: 155 }}\n{%- endcapture -%}\n<meta name="description" content="{{ meta_desc | escape }}">'));
    } else {
      issues.push(issue('META_DESC_OK', Category.META, Severity.PASS, 'Meta description is well-optimized', '', ''));
    }

    // OG Tags
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
    const ogDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
    const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
    const ogUrl = doc.querySelector('meta[property="og:url"]')?.getAttribute('content') || '';
    const ogType = doc.querySelector('meta[property="og:type"]')?.getAttribute('content') || '';
    data.og = { title: ogTitle, description: ogDesc, image: ogImage, url: ogUrl, type: ogType };

    if (!ogTitle || !ogDesc || !ogImage) {
      const missing = [];
      if (!ogTitle) missing.push('og:title');
      if (!ogDesc) missing.push('og:description');
      if (!ogImage) missing.push('og:image');
      issues.push(issue('OG_TAGS_MISSING', Category.META, Severity.WARNING, `Missing Open Graph tags: ${missing.join(', ')}`,
        'OG tags control how your page appears when shared on social platforms.', 'Add missing OG tags. Recommended og:image size: 1200x630px.',
        '<meta property="og:title" content="{{ page_title | escape }}">\n<meta property="og:description" content="{{ page_description | escape }}">\n<meta property="og:image" content="{{ page_image | image_url: width: 1200 }}">\n<meta property="og:url" content="{{ canonical_url }}">\n<meta property="og:type" content="website">\n<meta property="og:site_name" content="{{ shop.name | escape }}">'));
    } else {
      issues.push(issue('OG_TAGS_OK', Category.META, Severity.PASS, 'Open Graph tags are present', '', ''));
    }

    // Twitter
    const twCard = doc.querySelector('meta[name="twitter:card"]')?.getAttribute('content') || '';
    const twTitle = doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content') || '';
    const twDesc = doc.querySelector('meta[name="twitter:description"]')?.getAttribute('content') || '';
    const twImage = doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content') || '';
    data.twitter = { card: twCard, title: twTitle, description: twDesc, image: twImage };

    if (!twCard) {
      issues.push(issue('TWITTER_CARD_MISSING', Category.META, Severity.INFO, 'Missing Twitter Card tags',
        'Twitter Cards enhance link previews on X/Twitter.', 'Add twitter:card, twitter:title, twitter:description, twitter:image.',
        '<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="{{ page_title | escape }}">\n<meta name="twitter:description" content="{{ page_description | escape }}">\n<meta name="twitter:image" content="{{ page_image | image_url: width: 1200 }}">'));
    } else {
      issues.push(issue('TWITTER_CARD_OK', Category.META, Severity.PASS, 'Twitter Card tags present', '', ''));
    }

    // Viewport
    const viewport = doc.querySelector('meta[name="viewport"]')?.getAttribute('content') || '';
    data.viewport = viewport;
    if (!viewport) {
      issues.push(issue('VIEWPORT_MISSING', Category.META, Severity.CRITICAL, 'Missing viewport meta tag',
        'Without viewport, mobile devices render at desktop width.', 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
        '<meta name="viewport" content="width=device-width, initial-scale=1">'));
    } else {
      issues.push(issue('VIEWPORT_OK', Category.META, Severity.PASS, 'Viewport meta tag present', '', ''));
    }

    // Charset
    const charset = doc.querySelector('meta[charset]') || doc.querySelector('meta[http-equiv="Content-Type"]');
    data.hasCharset = !!charset;
    if (!charset) {
      issues.push(issue('CHARSET_MISSING', Category.META, Severity.INFO, 'Missing charset declaration', '', 'Add <meta charset="UTF-8">.',
        '<meta charset="UTF-8">'));
    }

    // Language
    const htmlLang = doc.documentElement.getAttribute('lang') || '';
    data.language = htmlLang;
    if (!htmlLang) {
      issues.push(issue('LANG_MISSING', Category.META, Severity.WARNING, 'Missing lang attribute on <html>',
        'The lang attribute helps search engines understand page language.', 'Add lang="en" to your <html> tag.',
        '<html lang="en">'));
    }

    return { issues, data };
  }

  // ============================================================
  // HEADINGS ANALYZER
  // ============================================================
  function analyzeHeadings(doc) {
    const issues = [];
    const data = {};

    const headings = [];
    doc.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
      headings.push({ level: parseInt(h.tagName[1]), text: h.textContent?.trim() || '', element: h.tagName });
    });

    data.headings = headings;
    data.headingCounts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
    headings.forEach(h => { data.headingCounts[`h${h.level}`]++; });

    const h1Count = data.headingCounts.h1;
    if (h1Count === 0) {
      issues.push(issue('H1_MISSING', Category.CONTENT, Severity.CRITICAL, 'Missing H1 heading',
        'Every page should have exactly one H1 tag.', 'Add a single H1 heading with your primary keyword.',
        '<!-- For product pages -->\n<h1>{{ product.title }}</h1>\n\n<!-- For collection pages -->\n<h1>{{ collection.title }}</h1>\n\n<!-- For other pages -->\n<h1>{{ page.title }}</h1>'));
    } else if (h1Count > 1) {
      issues.push(issue('H1_MULTIPLE', Category.CONTENT, Severity.WARNING, `Multiple H1 tags found (${h1Count})`,
        'Multiple H1s can confuse search engines.', 'Keep only one H1 per page.',
        '<!-- Keep the main H1 -->\n<h1>Primary Page Title</h1>\n\n<!-- Change additional H1s to H2 -->\n<h2>Secondary Section Title</h2>'));
    } else {
      const h1Text = headings.find(h => h.level === 1)?.text || '';
      if (h1Text.length < 10) {
        issues.push(issue('H1_SHORT', Category.CONTENT, Severity.WARNING, 'H1 heading is very short',
          `"${h1Text}" is only ${h1Text.length} characters.`, 'Make your H1 more descriptive.',
          '<!-- Be descriptive with your H1 -->\n<h1>{{ product.title }} - {{ product.type }}</h1>'));
      } else if (h1Text.length > 70) {
        issues.push(issue('H1_LONG', Category.CONTENT, Severity.INFO, `H1 heading is long (${h1Text.length} chars)`,
          'Long H1s can dilute keyword focus.', 'Consider shortening.',
          '<!-- Keep H1 concise and keyword-focused -->\n<h1>{{ product.title }}</h1>'));
      } else {
        issues.push(issue('H1_OK', Category.CONTENT, Severity.PASS, 'H1 heading is well-structured', '', ''));
      }
    }

    // Hierarchy check
    let hasSkip = false;
    for (let i = 1; i < headings.length; i++) {
      if (headings[i].level > headings[i-1].level + 1) { hasSkip = true; break; }
    }
    if (hasSkip) {
      issues.push(issue('HEADING_SKIP', Category.CONTENT, Severity.WARNING, 'Heading hierarchy has skipped levels',
        'Jumping levels breaks the document outline.', 'Ensure headings follow logical order: H1 > H2 > H3.',
        '<!-- Correct heading hierarchy -->\n<h1>Product Name</h1>\n  <h2>Product Details</h2>\n    <h3>Materials</h3>\n    <h3>Dimensions</h3>\n  <h2>Customer Reviews</h2>\n    <h3>Top Reviews</h3>'));
    } else if (headings.length > 1) {
      issues.push(issue('HEADING_HIERARCHY_OK', Category.CONTENT, Severity.PASS, 'Heading hierarchy is correct', '', ''));
    }

    const emptyHeadings = headings.filter(h => !h.text);
    if (emptyHeadings.length > 0) {
      issues.push(issue('HEADING_EMPTY', Category.CONTENT, Severity.WARNING, `${emptyHeadings.length} empty heading(s) found`,
        'Empty headings provide no SEO value.', 'Add content to empty headings or remove them.',
        '<!-- Either add content -->\n<h2>Your Section Title Here</h2>\n\n<!-- Or remove the empty heading entirely -->'));
    }

    if (headings.length === 0) {
      issues.push(issue('NO_HEADINGS', Category.CONTENT, Severity.WARNING, 'No headings found on page',
        'Headings help structure content.', 'Add relevant headings (H1-H6).',
        '<h1>{{ page_title }}</h1>\n<h2>About This Product</h2>\n<p>Product description here...</p>\n<h2>Features</h2>\n<ul>\n  <li>Feature 1</li>\n</ul>'));
    }

    return { issues, data };
  }

  // ============================================================
  // IMAGES ANALYZER
  // ============================================================
  function analyzeImages(doc) {
    const issues = [];
    const data = {};
    const images = Array.from(doc.querySelectorAll('img'));
    data.totalImages = images.length;

    if (images.length === 0) { data.imageDetails = []; return { issues, data }; }

    let missingAlt = 0, emptyAlt = 0, missingDimensions = 0, lazyLoaded = 0, modernFormat = 0;
    const imageDetails = [];

    images.forEach((img, i) => {
      const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
      const alt = img.getAttribute('alt');
      const hasAlt = alt !== null;
      const width = img.getAttribute('width');
      const height = img.getAttribute('height');
      const isLazy = img.getAttribute('loading') === 'lazy' || img.hasAttribute('data-src') || img.classList.contains('lazyload');
      const srcLower = src.toLowerCase();
      const isModern = srcLower.includes('.webp') || srcLower.includes('.avif') || srcLower.includes('format=webp');

      if (!hasAlt) missingAlt++;
      else if (!alt.trim()) emptyAlt++;
      if (!width || !height) missingDimensions++;
      if (isLazy) lazyLoaded++;
      if (isModern) modernFormat++;

      imageDetails.push({ index: i, src: src.substring(0, 200), alt: alt?.trim() || '', hasAlt, width, height, isLazy, isModern });
    });

    data.imageDetails = imageDetails;
    data.missingAlt = missingAlt;
    data.emptyAlt = emptyAlt;
    data.missingDimensions = missingDimensions;
    data.lazyLoaded = lazyLoaded;
    data.modernFormat = modernFormat;

    if (missingAlt > 0) {
      issues.push(issue('IMG_ALT_MISSING', Category.IMAGES, missingAlt > 5 ? Severity.CRITICAL : Severity.WARNING,
        `${missingAlt} image(s) missing alt attribute`,
        'Images without alt hurt accessibility and miss SEO opportunities.', 'Add descriptive alt text to all images.',
        '<img\n  src="{{ image | image_url: width: 800 }}"\n  alt="{{ image.alt | escape }}"\n  width="{{ image.width }}"\n  height="{{ image.height }}"\n>'));
    } else {
      issues.push(issue('IMG_ALT_OK', Category.IMAGES, Severity.PASS, 'All images have alt attributes', '', ''));
    }

    if (emptyAlt > 3) {
      issues.push(issue('IMG_ALT_EMPTY', Category.IMAGES, Severity.INFO, `${emptyAlt} image(s) have empty alt`,
        'Empty alt is OK for decorative images only.', 'Review and add descriptions for content images.',
        '<!-- For content images, add descriptive alt -->\n<img src="{{ image | image_url }}" alt="{{ image.alt | default: product.title | escape }}">\n\n<!-- Only decorative images should have empty alt -->\n<img src="decorative-bg.png" alt="" role="presentation">'));
    }

    if (missingDimensions > 0) {
      issues.push(issue('IMG_DIMENSIONS_MISSING', Category.IMAGES, Severity.WARNING,
        `${missingDimensions} image(s) missing width/height`,
        'Missing dimensions cause layout shifts (CLS).', 'Add width and height attributes.',
        '<img\n  src="{{ image | image_url: width: 800 }}"\n  alt="{{ image.alt | escape }}"\n  width="{{ image.width }}"\n  height="{{ image.height }}"\n  loading="lazy"\n>'));
    } else {
      issues.push(issue('IMG_DIMENSIONS_OK', Category.IMAGES, Severity.PASS, 'All images have dimensions set', '', ''));
    }

    if (images.length > 3 && lazyLoaded < images.length * 0.5) {
      issues.push(issue('IMG_LAZY_LOW', Category.IMAGES, Severity.WARNING,
        `Only ${lazyLoaded}/${images.length} images use lazy loading`,
        'Lazy loading defers off-screen images.', 'Add loading="lazy" to below-fold images.',
        '<!-- Add loading="lazy" to images below the fold -->\n<img\n  src="{{ image | image_url: width: 600 }}"\n  alt="{{ image.alt | escape }}"\n  width="{{ image.width }}"\n  height="{{ image.height }}"\n  loading="lazy"\n>'));
    } else if (images.length > 3) {
      issues.push(issue('IMG_LAZY_OK', Category.IMAGES, Severity.PASS, 'Good lazy loading coverage', '', ''));
    }

    if (images.length > 2 && modernFormat < images.length * 0.3) {
      issues.push(issue('IMG_FORMAT_OLD', Category.IMAGES, Severity.INFO,
        `Only ${modernFormat}/${images.length} images use modern formats`,
        'WebP/AVIF are 25-50% smaller.', 'Use Shopify image_url filter with format parameter for WebP.',
        '<!-- Use Shopify\'s built-in WebP conversion -->\n{{ image | image_url: width: 800, format: \'webp\' }}\n\n<!-- Or in an img tag -->\n<img src="{{ image | image_url: width: 800, format: \'webp\' }}" alt="{{ image.alt | escape }}">'));
    }

    return { issues, data };
  }

  // ============================================================
  // LINKS ANALYZER
  // ============================================================
  function analyzeLinks(doc, url) {
    const issues = [];
    const data = {};
    const links = Array.from(doc.querySelectorAll('a[href]'));
    const currentHost = new URL(url).hostname;

    let internal = 0, external = 0, nofollow = 0, emptyAnchors = 0, brokenIndicators = 0;
    const externalDomains = new Set();
    const linkDetails = [];
    const internalLinkMap = [];

    links.forEach(link => {
      const href = link.getAttribute('href') || '';
      const text = link.textContent?.trim() || '';
      const rel = link.getAttribute('rel') || '';
      const isNofollow = rel.includes('nofollow');
      let type = 'internal';

      try {
        if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
          const linkHost = new URL(href, url).hostname;
          if (linkHost !== currentHost) { type = 'external'; external++; externalDomains.add(linkHost); }
          else internal++;
        } else if (href.startsWith('#')) { type = 'hash'; }
        else if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) { type = 'special'; }
        else internal++;
      } catch { internal++; }

      if (isNofollow) nofollow++;
      if (!text && !link.getAttribute('title') && !link.querySelector('img')) emptyAnchors++;
      if (href === '#' || href === '' || href === 'javascript:void(0)') brokenIndicators++;

      linkDetails.push({ href: href.substring(0, 200), text: text.substring(0, 100), type, isNofollow, hasText: !!text });

      // Build internal link map
      if (type !== 'external' && type !== 'hash' && type !== 'special') {
        try {
          const resolvedUrl = new URL(href, url);
          internalLinkMap.push({
            from: new URL(url).pathname,
            to: resolvedUrl.pathname,
            text: text.substring(0, 60)
          });
        } catch {}
      }
    });

    data.totalLinks = links.length;
    data.internal = internal;
    data.external = external;
    data.nofollow = nofollow;
    data.emptyAnchors = emptyAnchors;
    data.externalDomains = Array.from(externalDomains);
    data.linkDetails = linkDetails.slice(0, 200);
    data.internalLinkMap = internalLinkMap;

    if (internal < 3) {
      issues.push(issue('LINKS_INTERNAL_LOW', Category.LINKS, Severity.WARNING, `Only ${internal} internal links`,
        'Internal links help site structure.', 'Add more internal links to related pages.',
        '<!-- Link to related collections -->\n<a href="/collections/{{ collection.handle }}">{{ collection.title }}</a>\n\n<!-- Link to related products -->\n<a href="/products/{{ product.handle }}">{{ product.title }}</a>\n\n<!-- Link to blog content -->\n<a href="/blogs/{{ blog.handle }}/{{ article.handle }}">{{ article.title }}</a>'));
    } else {
      issues.push(issue('LINKS_INTERNAL_OK', Category.LINKS, Severity.PASS, `${internal} internal links found`, '', ''));
    }

    if (emptyAnchors > 0) {
      issues.push(issue('LINKS_EMPTY_ANCHOR', Category.LINKS, Severity.WARNING, `${emptyAnchors} link(s) with no anchor text`,
        'Links without text provide no context.', 'Add descriptive anchor text.',
        '<!-- Add descriptive text to links -->\n<a href="/products/{{ product.handle }}" title="{{ product.title }}">{{ product.title }}</a>\n\n<!-- For icon links, add aria-label -->\n<a href="/cart" aria-label="View shopping cart">\n  <svg>...</svg>\n</a>'));
    }

    if (brokenIndicators > 3) {
      issues.push(issue('LINKS_BROKEN', Category.LINKS, Severity.INFO, `${brokenIndicators} placeholder links detected`,
        'Placeholder links provide no SEO value.', 'Replace with actual URLs.',
        '<!-- Replace placeholder links with real URLs -->\n<a href="/collections/new-arrivals">New Arrivals</a>\n\n<!-- Instead of -->\n<a href="#">New Arrivals</a>'));
    }

    return { issues, data };
  }

  // ============================================================
  // SCHEMA ANALYZER
  // ============================================================
  function analyzeSchema(doc) {
    const issues = [];
    const data = {};
    const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
    const schemas = [];
    const schemaTypes = new Set();

    jsonLdScripts.forEach(script => {
      try {
        const parsed = JSON.parse(script.textContent);
        if (Array.isArray(parsed)) {
          parsed.forEach(item => { schemas.push(item); if (item['@type']) schemaTypes.add(item['@type']); });
        } else {
          schemas.push(parsed);
          if (parsed['@type']) schemaTypes.add(parsed['@type']);
          if (parsed['@graph']) {
            parsed['@graph'].forEach(item => { schemas.push(item); if (item['@type']) schemaTypes.add(item['@type']); });
          }
        }
      } catch {
        issues.push(issue('SCHEMA_PARSE_ERROR', Category.TECHNICAL, Severity.CRITICAL, 'Invalid JSON-LD structured data',
          'Invalid JSON in structured data.', 'Fix JSON-LD syntax. Validate at validator.schema.org.',
          '<!-- Ensure valid JSON-LD -->\n<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Product",\n  "name": "{{ product.title | escape }}"\n}\n</script>'));
      }
    });

    data.schemas = schemas;
    data.schemaTypes = Array.from(schemaTypes);
    data.jsonLdCount = jsonLdScripts.length;

    if (schemas.length === 0) {
      issues.push(issue('SCHEMA_MISSING', Category.TECHNICAL, Severity.WARNING, 'No structured data found',
        'Structured data enables rich snippets.', 'Add JSON-LD structured data.',
        '<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Product",\n  "name": "{{ product.title | escape }}",\n  "image": "{{ product.featured_image | image_url: width: 1200 }}",\n  "description": "{{ product.description | strip_html | escape }}",\n  "brand": {\n    "@type": "Brand",\n    "name": "{{ product.vendor | escape }}"\n  },\n  "offers": {\n    "@type": "Offer",\n    "url": "{{ shop.url }}{{ product.url }}",\n    "priceCurrency": "{{ cart.currency.iso_code }}",\n    "price": "{{ product.price | money_without_currency }}",\n    "availability": "https://schema.org/{% if product.available %}InStock{% else %}OutOfStock{% endif %}"\n  }\n}\n</script>'));
      return { issues, data };
    }

    issues.push(issue('SCHEMA_FOUND', Category.TECHNICAL, Severity.PASS, `${schemas.length} structured data block(s) found`, '', ''));

    const productSchema = schemas.find(s => s['@type'] === 'Product');
    data.hasProductSchema = !!productSchema;

    if (productSchema) {
      const missing = [];
      if (!productSchema.name) missing.push('name');
      if (!productSchema.image) missing.push('image');
      if (!productSchema.description) missing.push('description');
      if (missing.length > 0) {
        issues.push(issue('SCHEMA_PRODUCT_INCOMPLETE', Category.TECHNICAL, Severity.WARNING,
          `Product schema missing: ${missing.join(', ')}`, '', 'Add missing fields.',
          '<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Product",\n  "name": "{{ product.title | escape }}",\n  "image": "{{ product.featured_image | image_url: width: 1200 }}",\n  "description": "{{ product.description | strip_html | truncate: 500 | escape }}"\n}\n</script>'));
      }

      const offers = productSchema.offers || productSchema.offer;
      if (!offers) {
        issues.push(issue('SCHEMA_PRODUCT_NO_OFFERS', Category.TECHNICAL, Severity.CRITICAL,
          'Product schema missing offers/pricing', 'Cannot show price in search results.', 'Add offers with price, priceCurrency, availability.',
          '"offers": {\n  "@type": "Offer",\n  "url": "{{ shop.url }}{{ product.url }}",\n  "priceCurrency": "{{ cart.currency.iso_code }}",\n  "price": "{{ product.price | money_without_currency }}",\n  "availability": "https://schema.org/{% if product.available %}InStock{% else %}OutOfStock{% endif %}",\n  "seller": {\n    "@type": "Organization",\n    "name": "{{ shop.name | escape }}"\n  }\n}'));
      } else {
        const o = Array.isArray(offers) ? offers[0] : offers;
        if (o && !o.price && !o.lowPrice) {
          issues.push(issue('SCHEMA_PRODUCT_NO_PRICE', Category.TECHNICAL, Severity.WARNING, 'Product offers missing price', '', 'Add price.',
            '"price": "{{ product.price | money_without_currency }}",\n"priceCurrency": "{{ cart.currency.iso_code }}"'));
        }
        if (o && !o.availability) {
          issues.push(issue('SCHEMA_PRODUCT_NO_AVAILABILITY', Category.TECHNICAL, Severity.INFO, 'Product offers missing availability', '', 'Add availability.',
            '"availability": "https://schema.org/{% if product.available %}InStock{% else %}OutOfStock{% endif %}"'));
        }
      }

      if (!productSchema.aggregateRating && !productSchema.review) {
        issues.push(issue('SCHEMA_PRODUCT_NO_REVIEWS', Category.TECHNICAL, Severity.INFO, 'No review data in Product schema',
          'Review stars boost click-through rates.', 'Add aggregateRating data.',
          '"aggregateRating": {\n  "@type": "AggregateRating",\n  "ratingValue": "4.5",\n  "reviewCount": "24"\n},\n"review": {\n  "@type": "Review",\n  "author": { "@type": "Person", "name": "Customer Name" },\n  "reviewRating": { "@type": "Rating", "ratingValue": "5" },\n  "reviewBody": "Great product!"\n}'));
      }
    }

    // Duplicate schema check
    const typeCount = {};
    schemas.forEach(s => { if (s['@type']) typeCount[s['@type']] = (typeCount[s['@type']] || 0) + 1; });
    for (const [type, count] of Object.entries(typeCount)) {
      if (count > 1 && ['Product', 'Organization', 'WebSite'].includes(type)) {
        issues.push(issue('SCHEMA_DUPLICATE', Category.TECHNICAL, Severity.WARNING,
          `Duplicate ${type} schema (${count}x)`, 'Common Shopify theme/app conflict.', 'Remove the duplicate.',
          '<!-- Check your theme.liquid and any apps for duplicate schema -->\n<!-- Only keep one instance of each schema type -->\n<!-- Common culprits: SEO apps, review apps, theme code -->'));
      }
    }

    if (!schemas.some(s => s['@type'] === 'BreadcrumbList')) {
      issues.push(issue('SCHEMA_BREADCRUMB_MISSING', Category.TECHNICAL, Severity.INFO, 'No BreadcrumbList schema',
        'Breadcrumbs enhance search results.', 'Add BreadcrumbList structured data.',
        '<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "BreadcrumbList",\n  "itemListElement": [\n    {\n      "@type": "ListItem",\n      "position": 1,\n      "name": "Home",\n      "item": "{{ shop.url }}"\n    },\n    {\n      "@type": "ListItem",\n      "position": 2,\n      "name": "{{ collection.title }}",\n      "item": "{{ shop.url }}/collections/{{ collection.handle }}"\n    },\n    {\n      "@type": "ListItem",\n      "position": 3,\n      "name": "{{ product.title }}"\n    }\n  ]\n}\n</script>'));
    }

    return { issues, data };
  }

  // ============================================================
  // TECHNICAL ANALYZER
  // ============================================================
  function analyzeTechnical(doc, url) {
    const issues = [];
    const data = {};
    const parsedUrl = new URL(url);

    const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
    data.canonical = canonical;
    if (!canonical) {
      issues.push(issue('CANONICAL_MISSING', Category.TECHNICAL, Severity.CRITICAL, 'Missing canonical tag',
        'May cause duplicate content.', 'Add <link rel="canonical" href="[URL]">.',
        '<link rel="canonical" href="{{ canonical_url }}">'));
    } else {
      try {
        const cu = new URL(canonical, url);
        if (cu.pathname !== parsedUrl.pathname) {
          issues.push(issue('CANONICAL_DIFFERENT', Category.TECHNICAL, Severity.INFO, 'Canonical points to different URL',
            `Canonicalizes to: ${canonical}`, 'Verify this is correct.'));
        } else {
          issues.push(issue('CANONICAL_OK', Category.TECHNICAL, Severity.PASS, 'Canonical tag is correct', '', ''));
        }
      } catch {
        issues.push(issue('CANONICAL_INVALID', Category.TECHNICAL, Severity.WARNING, 'Invalid canonical URL', '', 'Fix the URL.',
          '<link rel="canonical" href="{{ canonical_url }}">'));
      }
    }

    const robotsMeta = doc.querySelector('meta[name="robots"]')?.getAttribute('content') || '';
    data.robotsMeta = robotsMeta;
    if (robotsMeta.includes('noindex')) {
      issues.push(issue('ROBOTS_NOINDEX', Category.TECHNICAL, Severity.CRITICAL, 'Page is set to noindex',
        'This page will NOT appear in search results.', 'Remove noindex if you want this page indexed.',
        '<!-- Change from -->\n<meta name="robots" content="noindex, nofollow">\n\n<!-- To -->\n<meta name="robots" content="index, follow">'));
    }
    if (robotsMeta.includes('nofollow')) {
      issues.push(issue('ROBOTS_NOFOLLOW', Category.TECHNICAL, Severity.WARNING, 'Page is set to nofollow',
        'Search engines won\'t follow links.', 'Remove nofollow if unintended.',
        '<meta name="robots" content="index, follow">'));
    }

    data.urlPath = parsedUrl.pathname;
    data.urlLength = url.length;
    if (url.length > 115) {
      issues.push(issue('URL_LONG', Category.TECHNICAL, Severity.INFO, `URL is long (${url.length} chars)`, '', 'Keep URLs under 115 chars.',
        '<!-- Shopify auto-generates URLs from titles -->\n<!-- Edit the URL handle in Shopify Admin:\n     Products > Edit > Search engine listing > URL and handle -->\n<!-- Keep URLs short: /products/blue-widget\n     Instead of: /products/amazing-blue-widget-2024-sale-edition -->'));
    }
    if (parsedUrl.pathname.match(/[A-Z]/)) {
      issues.push(issue('URL_UPPERCASE', Category.TECHNICAL, Severity.WARNING, 'URL contains uppercase characters',
        'Can cause duplicate content.', 'Use lowercase-only URLs.',
        '<!-- Shopify handles are lowercase by default -->\n<!-- If you see uppercase, check:\n     1. Shopify Admin > URL handle field\n     2. Custom redirects in Settings > Navigation\n     3. Hardcoded links in theme code -->\n<!-- Set up a redirect from the uppercase URL to lowercase -->'));
    }

    const hreflangs = doc.querySelectorAll('link[rel="alternate"][hreflang]');
    data.hreflangs = Array.from(hreflangs).map(h => ({ lang: h.getAttribute('hreflang'), href: h.getAttribute('href') }));

    if (parsedUrl.protocol !== 'https:') {
      issues.push(issue('NOT_HTTPS', Category.TECHNICAL, Severity.CRITICAL, 'Not served over HTTPS',
        'HTTPS is a ranking signal.', 'Enable HTTPS.',
        '<!-- Shopify provides free SSL certificates -->\n<!-- Go to: Shopify Admin > Settings > Domains -->\n<!-- Enable "SSL certificate" for your domain -->\n<!-- All Shopify stores support HTTPS by default -->'));
    } else {
      issues.push(issue('HTTPS_OK', Category.TECHNICAL, Severity.PASS, 'HTTPS enabled', '', ''));
    }

    if (!doc.querySelector('link[rel="icon"]') && !doc.querySelector('link[rel="shortcut icon"]')) {
      issues.push(issue('FAVICON_MISSING', Category.TECHNICAL, Severity.INFO, 'No favicon detected', '', 'Add a favicon.',
        '<link rel="icon" type="image/png" href="{{ \'favicon.png\' | asset_url }}">\n<link rel="apple-touch-icon" href="{{ \'apple-touch-icon.png\' | asset_url }}">'));
    }

    return { issues, data };
  }

  // ============================================================
  // CONTENT ANALYZER
  // ============================================================
  function analyzeContent(doc) {
    const issues = [];
    const data = {};

    const bodyClone = doc.body.cloneNode(true);
    bodyClone.querySelectorAll('script, style, noscript, nav, footer, header').forEach(el => el.remove());
    const text = bodyClone.textContent?.replace(/\s+/g, ' ').trim() || '';
    const words = text.split(/\s+/).filter(w => w.length > 0);
    data.wordCount = words.length;

    if (words.length < 100) {
      issues.push(issue('CONTENT_THIN', Category.CONTENT, Severity.CRITICAL, `Thin content: only ${words.length} words`,
        'Very little content struggles to rank.', 'Add more content. Products: 150+ words. Blog: 1000+ words.',
        '<!-- For product pages, expand your description -->\n<div class="product-description">\n  <h2>About {{ product.title }}</h2>\n  <p>Detailed product description with features and benefits...</p>\n  \n  <h2>Key Features</h2>\n  <ul>\n    <li>Feature 1 with benefit</li>\n    <li>Feature 2 with benefit</li>\n  </ul>\n  \n  <h2>FAQ</h2>\n  <p>Common questions and answers...</p>\n</div>'));
    } else if (words.length < 300) {
      issues.push(issue('CONTENT_LOW', Category.CONTENT, Severity.WARNING, `Low word count: ${words.length} words`,
        'More content tends to rank better.', 'Add detailed descriptions, FAQs, etc.',
        '<!-- Add supplementary content sections -->\n<div class="additional-content">\n  <h2>Frequently Asked Questions</h2>\n  <details>\n    <summary>Question about the product?</summary>\n    <p>Detailed answer here...</p>\n  </details>\n  \n  <h2>Shipping & Returns</h2>\n  <p>Shipping details and return policy...</p>\n</div>'));
    } else {
      issues.push(issue('CONTENT_OK', Category.CONTENT, Severity.PASS, `Good content length: ${words.length} words`, '', ''));
    }

    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    data.sentenceCount = sentences.length;

    if (sentences.length > 0 && words.length > 30) {
      const avgWPS = words.length / sentences.length;
      const syllables = words.reduce((c, w) => c + countSyllables(w), 0);
      const avgSPW = syllables / words.length;
      const flesch = Math.round(206.835 - (1.015 * avgWPS) - (84.6 * avgSPW));
      data.readabilityScore = Math.max(0, Math.min(100, flesch));
      data.avgWordsPerSentence = Math.round(avgWPS * 10) / 10;

      if (flesch < 30) {
        issues.push(issue('READABILITY_HARD', Category.CONTENT, Severity.WARNING, `Difficult to read (score: ${data.readabilityScore}/100)`,
          'Complex content drives users away.', 'Use shorter sentences, simpler words.',
          '<!-- Tips for improving readability -->\n<!-- 1. Break long sentences into shorter ones (15-20 words max) -->\n<!-- 2. Use simple, everyday words instead of jargon -->\n<!-- 3. Add bullet points for features and specs -->\n<!-- 4. Use short paragraphs (2-3 sentences) -->\n<!-- 5. Add subheadings to break up content -->'));
      } else if (flesch < 50) {
        issues.push(issue('READABILITY_MEDIUM', Category.CONTENT, Severity.INFO, `Moderate readability (score: ${data.readabilityScore}/100)`,
          '', 'Target 60-70 for e-commerce.',
          '<!-- Tips to improve readability score -->\n<!-- 1. Shorten sentences that are over 20 words -->\n<!-- 2. Replace complex words with simpler alternatives -->\n<!-- 3. Use active voice instead of passive -->\n<!-- 4. Target a score of 60-70 for e-commerce content -->'));
      } else {
        issues.push(issue('READABILITY_OK', Category.CONTENT, Severity.PASS, `Good readability (score: ${data.readabilityScore}/100)`, '', ''));
      }
    }

    // Keywords
    const stopWords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','is','are','was','were','be','been','have','has','had','do','does','did','will','would','could','should','may','might','can','it','its','this','that','these','those','i','you','he','she','we','they','me','him','her','us','them','my','your','his','our','their','not','no','so','if','as','all','each','every','both','few','more','most','other','some','such','only','own','same','than','too','very','just','about','up','out','also','how','what','when','where','who','which','why','get','got','am','any','here','there']);
    const wordFreq = {};
    words.forEach(w => {
      const lower = w.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (lower.length > 2 && !stopWords.has(lower)) wordFreq[lower] = (wordFreq[lower] || 0) + 1;
    });

    data.topKeywords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 15)
      .map(([word, count]) => ({ word, count, density: Math.round((count / words.length) * 10000) / 100 }));

    data.paragraphCount = doc.querySelectorAll('p').length;

    const stuffed = data.topKeywords.filter(k => k.density > 5);
    if (stuffed.length > 0) {
      issues.push(issue('KEYWORD_STUFFING', Category.CONTENT, Severity.WARNING,
        `Possible keyword stuffing: "${stuffed[0].word}" (${stuffed[0].density}%)`,
        'High density looks spammy.', 'Reduce repetition, use synonyms.',
        '<!-- Tips to fix keyword stuffing -->\n<!-- 1. Replace some instances with synonyms or related terms -->\n<!-- 2. Use the keyword naturally in context -->\n<!-- 3. Aim for 1-2% keyword density -->\n<!-- 4. Focus on writing for humans, not search engines -->\n<!-- 5. Use LSI (related) keywords instead of repeating the same term -->'));
    }

    return { issues, data };
  }

  function countSyllables(word) {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const m = word.match(/[aeiouy]{1,2}/g);
    return m ? m.length : 1;
  }

  // ============================================================
  // PERFORMANCE ANALYZER
  // ============================================================
  function analyzePerformance(doc) {
    const issues = [];
    const data = {};

    const allElements = doc.querySelectorAll('*');
    data.domElements = allElements.length;

    if (allElements.length > 3000) {
      issues.push(issue('DOM_TOO_LARGE', Category.PERFORMANCE, Severity.WARNING, `Large DOM: ${allElements.length} elements`,
        'Increases memory and slows interactions.', 'Simplify page structure, reduce nesting.',
        '<!-- Tips to reduce DOM size -->\n<!-- 1. Remove unused Shopify apps (each adds DOM elements) -->\n<!-- 2. Simplify section structure in theme -->\n<!-- 3. Use pagination instead of infinite scroll -->\n<!-- 4. Limit products per page in collections -->\n<!-- 5. Remove hidden/unused elements from templates -->'));
    } else if (allElements.length > 1500) {
      issues.push(issue('DOM_MODERATE', Category.PERFORMANCE, Severity.INFO, `Moderate DOM: ${allElements.length} elements`, '', ''));
    } else {
      issues.push(issue('DOM_OK', Category.PERFORMANCE, Severity.PASS, `Good DOM size: ${allElements.length} elements`, '', ''));
    }

    let maxDepth = 0;
    function getDepth(el, d) { if (d > maxDepth) maxDepth = d; if (d < 32) for (const c of el.children) getDepth(c, d + 1); }
    getDepth(doc.documentElement, 0);
    data.maxDomDepth = maxDepth;

    if (maxDepth > 15) {
      issues.push(issue('DOM_DEEP', Category.PERFORMANCE, Severity.WARNING, `Deep DOM nesting: ${maxDepth} levels`,
        'Slows CSS matching.', 'Flatten HTML structure.',
        '<!-- Tips to reduce DOM depth -->\n<!-- 1. Avoid unnecessary wrapper divs -->\n<!-- 2. Use CSS Grid/Flexbox instead of nested containers -->\n<!-- 3. Flatten deeply nested Shopify sections -->\n<!-- 4. Audit theme code for excessive nesting -->\n\n<!-- Instead of: -->\n<div><div><div><div><p>Content</p></div></div></div></div>\n\n<!-- Use: -->\n<div class="content-wrapper"><p>Content</p></div>'));
    }

    const blockingCSS = doc.querySelectorAll('link[rel="stylesheet"]:not([media="print"]):not([disabled])');
    const blockingJS = doc.querySelectorAll('script[src]:not([async]):not([defer]):not([type="module"])');
    data.blockingCSS = blockingCSS.length;
    data.blockingJS = blockingJS.length;

    if (blockingCSS.length > 5) {
      issues.push(issue('RENDER_BLOCKING_CSS', Category.PERFORMANCE, Severity.WARNING,
        `${blockingCSS.length} render-blocking CSS files`, '', 'Combine or inline critical CSS.',
        '<!-- Defer non-critical CSS -->\n<link rel="stylesheet" href="{{ \'non-critical.css\' | asset_url }}" media="print" onload="this.media=\'all\'">\n<noscript><link rel="stylesheet" href="{{ \'non-critical.css\' | asset_url }}"></noscript>\n\n<!-- Or inline critical CSS -->\n<style>\n  /* Critical above-the-fold CSS here */\n</style>'));
    }
    if (blockingJS.length > 5) {
      issues.push(issue('RENDER_BLOCKING_JS', Category.PERFORMANCE, Severity.WARNING,
        `${blockingJS.length} render-blocking JS files`, '', 'Add async or defer.',
        '<!-- Add defer to non-critical scripts -->\n<script src="{{ \'custom.js\' | asset_url }}" defer></script>\n\n<!-- Or async for independent scripts -->\n<script src="{{ \'analytics.js\' | asset_url }}" async></script>\n\n<!-- Note: Shopify app scripts may need to stay synchronous.\n     Audit each script before deferring. -->'));
    }

    const allScripts = doc.querySelectorAll('script[src]');
    data.totalScripts = allScripts.length;
    if (allScripts.length > 20) {
      issues.push(issue('TOO_MANY_SCRIPTS', Category.PERFORMANCE, Severity.WARNING,
        `${allScripts.length} external scripts`, 'Many scripts from apps.', 'Audit and remove unused apps.',
        '<!-- Steps to reduce scripts -->\n<!-- 1. Go to Shopify Admin > Apps -->\n<!-- 2. Identify apps you no longer use -->\n<!-- 3. Uninstall unused apps completely -->\n<!-- 4. Check for leftover code: Online Store > Themes > Edit code -->\n<!-- 5. Search theme files for removed app references -->\n<!-- 6. Consider replacing multiple apps with a single all-in-one solution -->'));
    }

    data.totalStylesheets = doc.querySelectorAll('link[rel="stylesheet"]').length;
    data.inlineStyles = doc.querySelectorAll('[style]').length;

    const iframes = doc.querySelectorAll('iframe');
    data.iframeCount = iframes.length;
    if (iframes.length > 3) {
      issues.push(issue('TOO_MANY_IFRAMES', Category.PERFORMANCE, Severity.WARNING,
        `${iframes.length} iframes`, '', 'Minimize and lazy-load iframes.',
        '<!-- Lazy-load iframes to improve performance -->\n<iframe\n  src="https://www.youtube.com/embed/VIDEO_ID"\n  loading="lazy"\n  width="560"\n  height="315"\n  title="Video title"\n  frameborder="0"\n  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"\n  allowfullscreen\n></iframe>'));
    }

    const thirdParty = Array.from(allScripts).filter(s => {
      try { return new URL(s.src, location.href).hostname !== location.hostname; } catch { return false; }
    });
    data.thirdPartyScripts = thirdParty.length;

    if (thirdParty.length > 10) {
      issues.push(issue('TOO_MANY_THIRD_PARTY', Category.PERFORMANCE, Severity.WARNING,
        `${thirdParty.length} third-party scripts`, 'Common cause of slow loads.', 'Remove non-essential apps/trackers.',
        '<!-- Steps to reduce third-party scripts -->\n<!-- 1. Audit apps: Shopify Admin > Apps -->\n<!-- 2. Remove unused tracking pixels -->\n<!-- 3. Consolidate analytics (use GTM instead of multiple trackers) -->\n<!-- 4. Defer non-essential third-party scripts -->\n<!-- 5. Consider server-side tracking for analytics -->\n<!-- 6. Review chat widgets - do you need them on every page? -->'));
    }

    return { issues, data };
  }

  // ============================================================
  // MOBILE ANALYZER
  // ============================================================
  function analyzeMobile(doc) {
    const issues = [];
    const data = {};

    const viewport = doc.querySelector('meta[name="viewport"]');
    const vc = viewport?.getAttribute('content') || '';
    data.viewport = vc;

    if (vc.includes('maximum-scale=1') || vc.includes('user-scalable=no')) {
      issues.push(issue('MOBILE_ZOOM_DISABLED', Category.PERFORMANCE, Severity.WARNING, 'Pinch-to-zoom disabled',
        'Hurts accessibility.', 'Remove maximum-scale=1 and user-scalable=no.',
        '<!-- Change from -->\n<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">\n\n<!-- To -->\n<meta name="viewport" content="width=device-width, initial-scale=1">'));
    }

    const wideElements = doc.querySelectorAll('table:not([style*="overflow"]), pre');
    data.potentialScrollElements = wideElements.length;
    if (wideElements.length > 0) {
      issues.push(issue('MOBILE_SCROLL', Category.PERFORMANCE, Severity.INFO,
        `${wideElements.length} element(s) may cause horizontal scroll`, '', 'Make tables responsive.',
        '<!-- Wrap tables in a scrollable container -->\n<div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">\n  <table>\n    <thead>...</thead>\n    <tbody>...</tbody>\n  </table>\n</div>\n\n<!-- For pre/code blocks -->\n<pre style="overflow-x: auto; white-space: pre-wrap; word-wrap: break-word;">\n  Code content here...\n</pre>'));
    }

    return { issues, data };
  }

  // ============================================================
  // SHOPIFY PRODUCT ANALYZER
  // ============================================================
  function analyzeProductPage(doc, url) {
    const issues = [];
    const data = {};

    const descEl = doc.querySelector('.product-description, .product__description, [data-product-description], .product-single__description, .rte');
    const descText = descEl?.textContent?.trim() || '';
    const descWords = descText.split(/\s+/).filter(w => w.length > 0).length;
    data.productDescriptionWords = descWords;

    if (descWords < 50) {
      issues.push(issue('SHOPIFY_PRODUCT_DESC_SHORT', Category.SHOPIFY, Severity.CRITICAL,
        `Product description very short (${descWords} words)`, 'Google needs content to rank.', 'Write 150+ words. Include features, benefits, materials.',
        '<!-- In your product template, ensure a rich description -->\n<div class="product-description rte">\n  {{ product.description }}\n</div>\n\n<!-- In Shopify Admin, write a detailed description:\n  - Product overview (2-3 sentences)\n  - Key features (bullet points)\n  - Materials/specifications\n  - Size guide\n  - Care instructions\n  - FAQ section -->'));
    } else if (descWords < 150) {
      issues.push(issue('SHOPIFY_PRODUCT_DESC_MEDIUM', Category.SHOPIFY, Severity.WARNING,
        `Product description could be longer (${descWords} words)`, '', 'Expand with bullet points, sizing, FAQ.',
        '<!-- Add supplementary content to your product template -->\n{% if product.metafields.custom.faq %}\n  <div class="product-faq">\n    <h2>Frequently Asked Questions</h2>\n    {{ product.metafields.custom.faq }}\n  </div>\n{% endif %}\n\n{% if product.metafields.custom.size_guide %}\n  <div class="size-guide">\n    <h2>Size Guide</h2>\n    {{ product.metafields.custom.size_guide }}\n  </div>\n{% endif %}'));
    } else {
      issues.push(issue('SHOPIFY_PRODUCT_DESC_OK', Category.SHOPIFY, Severity.PASS, `Good description (${descWords} words)`, '', ''));
    }

    const productImages = doc.querySelectorAll('.product-image img, .product__media img, [data-product-media] img, .product-single__photo img, .product__photo img');
    data.productImageCount = productImages.length || doc.querySelectorAll('.product img, [data-product] img').length;

    let noAlt = 0;
    productImages.forEach(img => { if (!img.getAttribute('alt')?.trim()) noAlt++; });
    if (noAlt > 0) {
      issues.push(issue('SHOPIFY_PRODUCT_IMG_ALT', Category.SHOPIFY, Severity.WARNING,
        `${noAlt} product image(s) missing alt text`, '', 'Add "[Product Name] - [Variant]" alt text.',
        '<!-- In Shopify Admin: Products > [Product] > Media -->\n<!-- Click each image and add alt text -->\n\n<!-- In your theme template -->\n{% for image in product.images %}\n  <img\n    src="{{ image | image_url: width: 800 }}"\n    alt="{{ image.alt | default: product.title | escape }}"\n    width="{{ image.width }}"\n    height="{{ image.height }}"\n    loading="{% if forloop.first %}eager{% else %}lazy{% endif %}"\n  >\n{% endfor %}'));
    }

    if (data.productImageCount < 3) {
      issues.push(issue('SHOPIFY_PRODUCT_FEW_IMAGES', Category.SHOPIFY, Severity.INFO,
        `Only ${data.productImageCount} product image(s)`, '', 'Add 3-5 images from different angles.',
        '<!-- Upload more images in Shopify Admin: Products > [Product] > Media -->\n<!-- Recommended product images: -->\n<!-- 1. Main product shot (front view) -->\n<!-- 2. Back/side view -->\n<!-- 3. Detail/texture closeup -->\n<!-- 4. Lifestyle/in-use photo -->\n<!-- 5. Size reference photo -->'));
    }

    // Variant canonical issue
    const currentUrl = new URL(url);
    if (currentUrl.searchParams.has('variant')) {
      const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
      if (canonical.includes('variant=')) {
        issues.push(issue('SHOPIFY_VARIANT_CANONICAL', Category.SHOPIFY, Severity.CRITICAL,
          'Canonical includes variant parameter', 'Causes duplicate content.', 'Remove variant from canonical tag.',
          '<!-- In theme.liquid or product template, override canonical -->\n{% if template contains \'product\' %}\n  <link rel="canonical" href="{{ shop.url }}{{ product.url }}">\n{% else %}\n  <link rel="canonical" href="{{ canonical_url }}">\n{% endif %}'));
      }
    }

    // Reviews
    const reviewSection = doc.querySelector('[data-reviews], .product-reviews, .spr-container, .yotpo, .stamped-container, .judgeme, .loox-reviews');
    data.hasReviews = !!reviewSection;
    if (!reviewSection) {
      issues.push(issue('SHOPIFY_NO_REVIEWS', Category.SHOPIFY, Severity.INFO, 'No review section detected',
        'Reviews add unique content and enable stars in search.', 'Install a review app.',
        '<!-- Popular Shopify review apps: -->\n<!-- - Judge.me (free plan available) -->\n<!-- - Loox (photo reviews) -->\n<!-- - Stamped.io -->\n<!-- - Yotpo -->\n\n<!-- After installing, add the review widget to product template: -->\n<div id="product-reviews" data-product-id="{{ product.id }}">\n  <!-- Review app widget renders here -->\n</div>'));
    }

    return { issues, data };
  }

  // ============================================================
  // SHOPIFY COLLECTION ANALYZER
  // ============================================================
  function analyzeCollectionPage(doc, url) {
    const issues = [];
    const data = {};

    const descEl = doc.querySelector('.collection-description, .collection__description, [data-collection-description], .rte');
    const descText = descEl?.textContent?.trim() || '';
    data.hasDescription = descText.length > 0;
    data.collectionDescription = descText.substring(0, 500);

    if (!descText) {
      issues.push(issue('SHOPIFY_COLL_NO_DESC', Category.SHOPIFY, Severity.CRITICAL, 'Collection has no description',
        'No unique content makes it thin.', 'Add 100+ word description in Shopify Admin.',
        '<!-- Add description in Shopify Admin: -->\n<!-- Products > Collections > [Collection] > Description -->\n\n<!-- In your collection template, display the description -->\n{% if collection.description != blank %}\n  <div class="collection-description rte">\n    {{ collection.description }}\n  </div>\n{% endif %}\n\n<!-- Write a description that includes:\n  - What the collection is about\n  - Key products in this category\n  - Buying guide or tips\n  - Target keywords naturally -->'));
    } else if (descText.split(/\s+/).length < 50) {
      issues.push(issue('SHOPIFY_COLL_SHORT_DESC', Category.SHOPIFY, Severity.WARNING, 'Collection description is short',
        '', 'Expand to 100+ words.',
        '<!-- In Shopify Admin, expand your collection description -->\n<!-- Include: -->\n<!-- - Overview of the product category (2-3 sentences) -->\n<!-- - Why customers love these products -->\n<!-- - Key features to look for -->\n<!-- - Buying tips or guide -->\n\n<!-- You can also add content below products using metafields -->\n{% if collection.metafields.custom.bottom_content %}\n  <div class="collection-bottom-content">\n    {{ collection.metafields.custom.bottom_content }}\n  </div>\n{% endif %}'));
    }

    const products = doc.querySelectorAll('.product-card, .grid-product, .product-item, [data-product-card], .product-grid-item');
    data.productCount = products.length;

    let path;
    try { path = new URL(url).pathname; } catch { path = '/'; }
    try { if (typeof window !== 'undefined') path = window.location.pathname; } catch {}

    const tagMatch = path.match(/\/collections\/[^/]+\/([^/]+)/);
    if (tagMatch) {
      data.isTagPage = true;
      const robotsMeta = doc.querySelector('meta[name="robots"]')?.getAttribute('content') || '';
      if (!robotsMeta.includes('noindex')) {
        issues.push(issue('SHOPIFY_TAG_INDEXED', Category.SHOPIFY, Severity.WARNING,
          `Tag page "${tagMatch[1]}" is indexable`, 'May create duplicate content.', 'Add noindex to tag pages.',
          '<!-- In your theme.liquid or collection template -->\n{% if current_tags %}\n  <meta name="robots" content="noindex, follow">\n{% endif %}\n\n<!-- This prevents tag-filtered pages like -->\n<!-- /collections/shoes/red from being indexed -->\n<!-- while still allowing link equity to flow -->'));
      }
    }

    if (path.includes('/collections/all')) {
      issues.push(issue('SHOPIFY_COLLECTIONS_ALL', Category.SHOPIFY, Severity.WARNING,
        '/collections/all page detected', 'Often duplicates content.', 'Add noindex or give it unique purpose.',
        '<!-- In your theme.liquid -->\n{% if collection.handle == \'all\' %}\n  <meta name="robots" content="noindex, follow">\n{% endif %}\n\n<!-- Or redirect /collections/all to your main shop page -->\n<!-- In Shopify Admin > Settings > Navigation > URL Redirects -->\n<!-- Redirect: /collections/all -> / -->'));
    }

    return { issues, data };
  }

  // ============================================================
  // SHOPIFY BLOG ANALYZER
  // ============================================================
  function analyzeBlogPost(doc) {
    const issues = [];
    const data = {};

    const articleEl = doc.querySelector('article, .article, .blog-post, .article__content');
    const articleText = articleEl?.textContent?.trim() || '';
    const wordCount = articleText.split(/\s+/).filter(w => w.length > 0).length;
    data.articleWordCount = wordCount;

    if (wordCount < 300) {
      issues.push(issue('SHOPIFY_BLOG_SHORT', Category.SHOPIFY, Severity.WARNING,
        `Blog post is short (${wordCount} words)`, '', 'Aim for 1000-2000+ words.',
        '<!-- Structure for a comprehensive blog post -->\n<article>\n  <h1>{{ article.title }}</h1>\n  \n  <p>Introduction paragraph (50-100 words)...</p>\n  \n  <h2>Section 1</h2>\n  <p>Detailed content...</p>\n  \n  <h2>Section 2</h2>\n  <p>More detailed content...</p>\n  \n  <h2>FAQ</h2>\n  <p>Common questions and answers...</p>\n  \n  <h2>Conclusion</h2>\n  <p>Summary and call to action...</p>\n</article>'));
    } else if (wordCount < 800) {
      issues.push(issue('SHOPIFY_BLOG_MEDIUM', Category.SHOPIFY, Severity.INFO,
        `Blog post is ${wordCount} words`, '', 'Consider expanding.',
        '<!-- Ways to expand your blog content -->\n<!-- 1. Add more detailed explanations -->\n<!-- 2. Include expert tips or quotes -->\n<!-- 3. Add a FAQ section -->\n<!-- 4. Include product recommendations -->\n<!-- 5. Add step-by-step instructions -->\n<!-- 6. Include internal links to products/collections -->'));
    } else {
      issues.push(issue('SHOPIFY_BLOG_OK', Category.SHOPIFY, Severity.PASS, `Good length (${wordCount} words)`, '', ''));
    }

    // Article schema
    let hasArticleSchema = false;
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
      try {
        const p = JSON.parse(s.textContent);
        if (['Article', 'BlogPosting', 'NewsArticle'].includes(p['@type'])) hasArticleSchema = true;
      } catch {}
    });

    if (!hasArticleSchema) {
      issues.push(issue('SHOPIFY_BLOG_NO_SCHEMA', Category.SHOPIFY, Severity.WARNING,
        'No Article schema found', '', 'Add BlogPosting JSON-LD.',
        '<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "BlogPosting",\n  "headline": "{{ article.title | escape }}",\n  "image": "{{ article.image | image_url: width: 1200 }}",\n  "datePublished": "{{ article.published_at | date: \'%Y-%m-%dT%H:%M:%S\' }}",\n  "dateModified": "{{ article.updated_at | date: \'%Y-%m-%dT%H:%M:%S\' }}",\n  "author": {\n    "@type": "Person",\n    "name": "{{ article.author }}"\n  },\n  "publisher": {\n    "@type": "Organization",\n    "name": "{{ shop.name | escape }}",\n    "logo": {\n      "@type": "ImageObject",\n      "url": "{{ \'logo.png\' | asset_url }}"\n    }\n  },\n  "description": "{{ article.excerpt_or_content | strip_html | truncate: 160 | escape }}"\n}\n</script>'));
    }

    // Internal links in content
    if (articleEl) {
      const internalLinks = Array.from(articleEl.querySelectorAll('a[href]')).filter(a => {
        const href = a.getAttribute('href') || '';
        try { return href.startsWith('/') || new URL(href, document.baseURI).hostname === location.hostname; } catch { return href.startsWith('/'); }
      });
      data.internalLinksInContent = internalLinks.length;

      if (internalLinks.length === 0) {
        issues.push(issue('SHOPIFY_BLOG_NO_LINKS', Category.SHOPIFY, Severity.WARNING,
          'No internal links in blog content', '', 'Add 2-5 internal links to products or collections.',
          '<!-- Add internal links within your blog content -->\n<!-- Link to relevant products -->\n<a href="/products/{{ product.handle }}">{{ product.title }}</a>\n\n<!-- Link to collections -->\n<a href="/collections/{{ collection.handle }}">Shop our {{ collection.title }}</a>\n\n<!-- Link to related blog posts -->\n<a href="/blogs/{{ blog.handle }}/{{ article.handle }}">Read more about...</a>\n\n<!-- Recommended: 2-5 internal links per blog post -->'));
      }
    }

    return { issues, data };
  }

  // ============================================================
  // SHOPIFY THEME ANALYZER
  // ============================================================
  function analyzeThemeIssues(doc) {
    const issues = [];
    const data = {};

    // Breadcrumbs
    data.hasBreadcrumbs = !!doc.querySelector('.breadcrumb, .breadcrumbs, nav[aria-label*="readcrumb"], [data-breadcrumbs]');
    let path;
    try { path = new URL(doc.URL || doc.baseURI || '').pathname; } catch { path = '/'; }
    try { if (typeof window !== 'undefined') path = window.location.pathname; } catch {}

    if (!data.hasBreadcrumbs && path !== '/') {
      issues.push(issue('SHOPIFY_NO_BREADCRUMBS', Category.SHOPIFY, Severity.WARNING, 'No breadcrumb navigation',
        'Breadcrumbs help navigation and enable rich results.', 'Add breadcrumbs with BreadcrumbList schema.',
        '<!-- Add breadcrumb navigation to your theme -->\n<nav aria-label="Breadcrumb">\n  <ol class="breadcrumbs">\n    <li><a href="/">Home</a></li>\n    {% if collection %}\n      <li><a href="{{ collection.url }}">{{ collection.title }}</a></li>\n    {% endif %}\n    {% if product %}\n      <li>{{ product.title }}</li>\n    {% endif %}\n  </ol>\n</nav>\n\n<!-- Don\'t forget the matching BreadcrumbList JSON-LD schema -->'));
    }

    // Search
    data.hasSearch = !!doc.querySelector('form[action="/search"], input[name="q"][type="search"]');
    if (!data.hasSearch) {
      issues.push(issue('SHOPIFY_NO_SEARCH', Category.SHOPIFY, Severity.INFO, 'No search functionality',
        '', 'Add search with WebSite SearchAction schema.',
        '<!-- Add search form to your header -->\n<form action="/search" method="get" role="search">\n  <input type="search" name="q" placeholder="Search..." aria-label="Search">\n  <button type="submit">Search</button>\n</form>\n\n<!-- Add SearchAction schema to theme.liquid -->\n<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "WebSite",\n  "url": "{{ shop.url }}",\n  "potentialAction": {\n    "@type": "SearchAction",\n    "target": "{{ shop.url }}/search?q={search_term_string}",\n    "query-input": "required name=search_term_string"\n  }\n}\n</script>'));
    }

    // Social links
    const socialLinks = doc.querySelectorAll('a[href*="facebook.com"], a[href*="instagram.com"], a[href*="twitter.com"], a[href*="tiktok.com"], a[href*="pinterest.com"], a[href*="youtube.com"]');
    data.socialLinkCount = socialLinks.length;
    if (socialLinks.length === 0) {
      issues.push(issue('SHOPIFY_NO_SOCIAL', Category.SHOPIFY, Severity.INFO, 'No social media links', '', 'Add social links.',
        '<!-- Add social links to your footer -->\n<div class="social-links">\n  {% if settings.social_facebook_link != blank %}\n    <a href="{{ settings.social_facebook_link }}" target="_blank" rel="noopener" aria-label="Facebook">\n      Facebook\n    </a>\n  {% endif %}\n  {% if settings.social_instagram_link != blank %}\n    <a href="{{ settings.social_instagram_link }}" target="_blank" rel="noopener" aria-label="Instagram">\n      Instagram\n    </a>\n  {% endif %}\n</div>\n\n<!-- Configure in: Shopify Admin > Online Store > Themes > Customize > Theme Settings > Social media -->'));
    }

    // Lazy hero images
    const firstImages = Array.from(doc.querySelectorAll('img')).slice(0, 3);
    const lazyHero = firstImages.filter(img => img.getAttribute('loading') === 'lazy' || img.classList.contains('lazyload'));
    if (lazyHero.length > 0) {
      issues.push(issue('SHOPIFY_LAZY_HERO', Category.SHOPIFY, Severity.WARNING,
        `${lazyHero.length} above-fold image(s) lazy-loaded`, 'Delays LCP.', 'Remove lazy loading from hero images.',
        '<!-- Hero/above-fold images should load eagerly -->\n<img\n  src="{{ section.settings.hero_image | image_url: width: 1200 }}"\n  alt="{{ section.settings.hero_image.alt | escape }}"\n  width="{{ section.settings.hero_image.width }}"\n  height="{{ section.settings.hero_image.height }}"\n  loading="eager"\n  fetchpriority="high"\n>\n\n<!-- Only lazy-load images below the fold -->\n<!-- Use loading="lazy" for product grid images, footer images, etc. -->'));
    }

    // App bloat
    const scripts = doc.querySelectorAll('script[src]');
    const appScripts = Array.from(scripts).filter(s => {
      const src = s.getAttribute('src') || '';
      return src.includes('apps.shopify.com') || src.includes('shopifyapps') || (src.includes('.js') && src.includes('/apps/'));
    });
    data.appScriptCount = appScripts.length;
    if (appScripts.length > 5) {
      issues.push(issue('SHOPIFY_APP_BLOAT', Category.SHOPIFY, Severity.WARNING,
        `${appScripts.length} app scripts detected`, 'Slows down store.', 'Remove non-essential apps.',
        '<!-- Steps to reduce app bloat -->\n<!-- 1. Go to Shopify Admin > Apps -->\n<!-- 2. Review each installed app -->\n<!-- 3. Uninstall apps you no longer use -->\n<!-- 4. After uninstalling, check theme code for leftover snippets: -->\n<!--    Online Store > Themes > Edit Code -->\n<!--    Search for the app name in all files -->\n<!-- 5. Remove any leftover app code from theme files -->\n<!-- 6. Consider consolidating: use fewer apps that do more -->'));
    }

    return { issues, data };
  }

  // ============================================================
  // CORE WEB VITALS MEASUREMENT
  // ============================================================
  function measureCoreWebVitals() {
    const cwv = { lcp: null, cls: null, inp: null, fcp: null, ttfb: null };

    // TTFB
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav) cwv.ttfb = Math.round(nav.responseStart - nav.requestStart);
    } catch {}

    // FCP
    try {
      const fcp = performance.getEntriesByType('paint').find(e => e.name === 'first-contentful-paint');
      if (fcp) cwv.fcp = Math.round(fcp.startTime);
    } catch {}

    // LCP - use last entry
    try {
      const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
      if (lcpEntries.length > 0) cwv.lcp = Math.round(lcpEntries[lcpEntries.length - 1].startTime);
    } catch {}

    // CLS - sum of layout shift entries without recent input
    try {
      const clsEntries = performance.getEntriesByType('layout-shift');
      let clsValue = 0;
      clsEntries.forEach(e => { if (!e.hadRecentInput) clsValue += e.value; });
      cwv.cls = Math.round(clsValue * 1000) / 1000;
    } catch {}

    return cwv;
  }

  // ============================================================
  // MAIN ANALYSIS ORCHESTRATOR
  // ============================================================
  let cachedResult = null;
  let cachedUrl = null;

  function runAnalysis(externalDoc, externalUrl) {
    const url = externalUrl || window.location.href;
    const doc = externalDoc || document;
    const isExternal = !!externalDoc;
    const shopify = detectShopify(doc);

    const allIssues = [];
    const issuesByCategory = {};
    Object.values(Category).forEach(c => { issuesByCategory[c] = []; });
    const allData = {};

    // Run all analyzers
    const analyzers = [
      { name: 'meta', fn: () => analyzeMetaTags(doc, url) },
      { name: 'headings', fn: () => analyzeHeadings(doc) },
      { name: 'images', fn: () => analyzeImages(doc) },
      { name: 'links', fn: () => analyzeLinks(doc, url) },
      { name: 'schema', fn: () => analyzeSchema(doc) },
      { name: 'technical', fn: () => analyzeTechnical(doc, url) },
      { name: 'content', fn: () => analyzeContent(doc) },
      { name: 'performance', fn: () => analyzePerformance(doc) },
      { name: 'mobile', fn: () => analyzeMobile(doc) }
    ];

    analyzers.forEach(({ name, fn }) => {
      try {
        const { issues: iss, data } = fn();
        allData[name] = data;
        iss.forEach(i => {
          allIssues.push(i);
          if (issuesByCategory[i.category]) issuesByCategory[i.category].push(i);
        });
      } catch (e) { console.error(`[ShopifySEO] ${name} error:`, e); }
    });

    // Core Web Vitals (only for real page, not external docs)
    if (!isExternal) {
      try {
        const cwv = measureCoreWebVitals();
        allData.cwv = cwv;

        if (cwv.lcp !== null) {
          if (cwv.lcp > 4000) allIssues.push(issue('CWV_LCP_POOR', Category.PERFORMANCE, Severity.CRITICAL, `Poor LCP: ${(cwv.lcp/1000).toFixed(1)}s`, 'Largest Contentful Paint over 4s is poor.', 'Optimize hero image, reduce server response time.', '<!-- Preload LCP image -->\n<link rel="preload" as="image" href="{{ image | image_url: width: 1200 }}">\n\n<!-- Ensure hero image loads eagerly -->\n<img src="{{ hero | image_url: width: 1200 }}" loading="eager" fetchpriority="high">'));
          else if (cwv.lcp > 2500) allIssues.push(issue('CWV_LCP_NEEDS_IMPROVEMENT', Category.PERFORMANCE, Severity.WARNING, `LCP needs improvement: ${(cwv.lcp/1000).toFixed(1)}s`, 'LCP should be under 2.5s.', 'Preload hero image, optimize server.', '<!-- Preload the LCP image in your theme.liquid <head> -->\n<link rel="preload" as="image" href="{{ section.settings.hero_image | image_url: width: 1200 }}">'));
          else allIssues.push(issue('CWV_LCP_GOOD', Category.PERFORMANCE, Severity.PASS, `Good LCP: ${(cwv.lcp/1000).toFixed(1)}s`, '', ''));

          if (issuesByCategory[Category.PERFORMANCE]) {
            const lcpIssue = allIssues[allIssues.length - 1];
            issuesByCategory[Category.PERFORMANCE].push(lcpIssue);
          }
        }

        if (cwv.cls !== null) {
          if (cwv.cls > 0.25) allIssues.push(issue('CWV_CLS_POOR', Category.PERFORMANCE, Severity.CRITICAL, `Poor CLS: ${cwv.cls}`, 'Layout shifts hurt user experience.', 'Add width/height to images, avoid injecting content above fold.', '<!-- Prevent layout shifts -->\n<!-- 1. Always set image dimensions -->\n<img src="..." alt="..." width="800" height="600">\n\n<!-- 2. Reserve space for dynamic content -->\n<div style="min-height: 200px;">\n  <!-- Dynamic content loads here -->\n</div>\n\n<!-- 3. Use CSS aspect-ratio -->\n<div style="aspect-ratio: 16/9;">\n  <img src="..." alt="..." style="width: 100%; height: 100%; object-fit: cover;">\n</div>'));
          else if (cwv.cls > 0.1) allIssues.push(issue('CWV_CLS_NEEDS_IMPROVEMENT', Category.PERFORMANCE, Severity.WARNING, `CLS needs improvement: ${cwv.cls}`, '', 'Set dimensions on images and ads.', '<!-- Set explicit dimensions on all images -->\n<img src="{{ image | image_url }}" width="{{ image.width }}" height="{{ image.height }}" alt="...">\n\n<!-- Reserve space for ad containers -->\n<div style="min-height: 250px;"><!-- Ad loads here --></div>'));
          else allIssues.push(issue('CWV_CLS_GOOD', Category.PERFORMANCE, Severity.PASS, `Good CLS: ${cwv.cls}`, '', ''));

          if (issuesByCategory[Category.PERFORMANCE]) {
            const clsIssue = allIssues[allIssues.length - 1];
            issuesByCategory[Category.PERFORMANCE].push(clsIssue);
          }
        }

        if (cwv.fcp !== null) {
          if (cwv.fcp > 3000) allIssues.push(issue('CWV_FCP_POOR', Category.PERFORMANCE, Severity.WARNING, `Slow FCP: ${(cwv.fcp/1000).toFixed(1)}s`, 'First paint over 3s.', 'Reduce render-blocking resources.', '<!-- Inline critical CSS for faster first paint -->\n<style>\n  /* Critical above-the-fold CSS */\n  body { margin: 0; font-family: sans-serif; }\n  .header { /* header styles */ }\n  .hero { /* hero styles */ }\n</style>\n\n<!-- Defer non-critical CSS -->\n<link rel="stylesheet" href="styles.css" media="print" onload="this.media=\'all\'">'));
          else if (cwv.fcp > 1800) allIssues.push(issue('CWV_FCP_NEEDS_IMPROVEMENT', Category.PERFORMANCE, Severity.INFO, `FCP could be faster: ${(cwv.fcp/1000).toFixed(1)}s`, '', 'Target under 1.8s.'));
          else allIssues.push(issue('CWV_FCP_GOOD', Category.PERFORMANCE, Severity.PASS, `Good FCP: ${(cwv.fcp/1000).toFixed(1)}s`, '', ''));

          if (issuesByCategory[Category.PERFORMANCE]) {
            const fcpIssue = allIssues[allIssues.length - 1];
            issuesByCategory[Category.PERFORMANCE].push(fcpIssue);
          }
        }

        if (cwv.ttfb !== null) {
          if (cwv.ttfb > 800) allIssues.push(issue('CWV_TTFB_POOR', Category.PERFORMANCE, Severity.WARNING, `Slow TTFB: ${cwv.ttfb}ms`, 'Server response is slow.', 'Check hosting, reduce server processing.', '<!-- TTFB optimization tips -->\n<!-- 1. Shopify handles hosting, but you can: -->\n<!-- 2. Reduce Liquid rendering time (simplify templates) -->\n<!-- 3. Minimize redirect chains -->\n<!-- 4. Use fewer apps that add server-side processing -->\n<!-- 5. Optimize images served from Shopify CDN -->'));
          else allIssues.push(issue('CWV_TTFB_GOOD', Category.PERFORMANCE, Severity.PASS, `Good TTFB: ${cwv.ttfb}ms`, '', ''));

          if (issuesByCategory[Category.PERFORMANCE]) {
            const ttfbIssue = allIssues[allIssues.length - 1];
            issuesByCategory[Category.PERFORMANCE].push(ttfbIssue);
          }
        }
      } catch (e) { console.error('[ShopifySEO] CWV error:', e); }
    }

    // Shopify-specific
    if (shopify.isShopify) {
      const shopifyAnalyzers = [
        { name: 'themeIssues', fn: () => analyzeThemeIssues(doc) },
      ];

      if (shopify.pageType === 'product') {
        shopifyAnalyzers.push({ name: 'product', fn: () => analyzeProductPage(doc, url) });
      }
      if (shopify.pageType === 'collection' || shopify.pageType === 'collections-list') {
        shopifyAnalyzers.push({ name: 'collection', fn: () => analyzeCollectionPage(doc, url) });
      }
      if (shopify.pageType === 'blog') {
        shopifyAnalyzers.push({ name: 'blog', fn: () => analyzeBlogPost(doc) });
      }

      shopifyAnalyzers.forEach(({ name, fn }) => {
        try {
          const { issues: iss, data } = fn();
          allData[name] = data;
          iss.forEach(i => {
            allIssues.push(i);
            issuesByCategory[Category.SHOPIFY].push(i);
          });
        } catch (e) { console.error(`[ShopifySEO] ${name} error:`, e); }
      });
    }

    // Compute scores
    const categoryScores = {};
    for (const [cat, catIssues] of Object.entries(issuesByCategory)) {
      let penalty = 0;
      catIssues.forEach(i => {
        if (i.severity === 'critical') penalty += 20;
        else if (i.severity === 'warning') penalty += 8;
        else if (i.severity === 'info') penalty += 2;
      });
      categoryScores[cat] = Math.max(0, Math.min(100, 100 - penalty));
    }

    const weights = { meta: 0.20, content: 0.15, technical: 0.20, images: 0.10, links: 0.10, performance: 0.10, shopify: shopify.isShopify ? 0.15 : 0 };
    if (!shopify.isShopify) {
      const extra = 0.15 / 6;
      Object.keys(weights).forEach(k => { if (k !== 'shopify') weights[k] += extra; });
    }

    let overallScore = 0, totalWeight = 0;
    for (const [cat, w] of Object.entries(weights)) {
      if (w > 0 && categoryScores[cat] !== undefined) {
        overallScore += categoryScores[cat] * w;
        totalWeight += w;
      }
    }
    overallScore = totalWeight > 0 ? Math.round(overallScore / totalWeight) : 0;

    const result = {
      url,
      timestamp: Date.now(),
      isShopify: shopify.isShopify,
      shopifyConfidence: shopify.confidence,
      shopifySignals: shopify.signals,
      pageType: shopify.pageType,
      overallScore,
      categoryScores,
      issueCount: {
        critical: allIssues.filter(i => i.severity === 'critical').length,
        warning: allIssues.filter(i => i.severity === 'warning').length,
        info: allIssues.filter(i => i.severity === 'info').length,
        pass: allIssues.filter(i => i.severity === 'pass').length
      },
      issues: allIssues,
      issuesByCategory,
      data: allData
    };

    if (!isExternal) {
      cachedResult = result;
      cachedUrl = url;
    }
    return result;
  }

  function highlightElement(selector) {
    document.querySelectorAll('.shopify-seo-highlight').forEach(el => {
      el.classList.remove('shopify-seo-highlight');
      el.style.outline = '';
    });
    try {
      const el = document.querySelector(selector);
      if (el) {
        el.style.outline = '3px solid #ef4444';
        el.style.outlineOffset = '2px';
        el.classList.add('shopify-seo-highlight');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = ''; el.classList.remove('shopify-seo-highlight'); }, 5000);
      }
    } catch {}
  }

  // ============================================================
  // MESSAGE LISTENER
  // ============================================================
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'ANALYZE_PAGE') {
      try {
        const result = runAnalysis();
        sendResponse(result);
      } catch (err) {
        sendResponse({ error: err.message });
      }
      return true;
    }

    if (message.type === 'ANALYZE_HTML') {
      try {
        const parser = new DOMParser();
        const externalDoc = parser.parseFromString(message.html, 'text/html');
        const result = runAnalysis(externalDoc, message.url);
        sendResponse(result);
      } catch (err) {
        sendResponse({ error: err.message });
      }
      return true;
    }

    if (message.type === 'GET_SHOPIFY_STATUS') {
      sendResponse(detectShopify(document));
      return true;
    }

    if (message.type === 'HIGHLIGHT_ELEMENT') {
      highlightElement(message.selector);
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === 'GET_CACHED_RESULT') {
      sendResponse(cachedUrl === window.location.href ? cachedResult : null);
      return true;
    }
  });

})();
