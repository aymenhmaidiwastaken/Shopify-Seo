/**
 * Schema / Structured Data Analyzer
 * Parses JSON-LD blocks, validates Product, BreadcrumbList, Organization, etc.
 */

import { Category, Severity, createIssue } from '../../shared/types.js';

export function analyzeSchema(doc) {
  const issues = [];
  const data = {};

  // Parse all JSON-LD blocks
  const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
  const schemas = [];
  const schemaTypes = new Set();

  jsonLdScripts.forEach(script => {
    try {
      const parsed = JSON.parse(script.textContent);
      if (Array.isArray(parsed)) {
        parsed.forEach(item => {
          schemas.push(item);
          if (item['@type']) schemaTypes.add(item['@type']);
        });
      } else {
        schemas.push(parsed);
        if (parsed['@type']) schemaTypes.add(parsed['@type']);
        // Handle @graph
        if (parsed['@graph']) {
          parsed['@graph'].forEach(item => {
            schemas.push(item);
            if (item['@type']) schemaTypes.add(item['@type']);
          });
        }
      }
    } catch (e) {
      issues.push(createIssue('SCHEMA_PARSE_ERROR', Category.TECHNICAL, Severity.CRITICAL,
        'Invalid JSON-LD structured data',
        'One or more JSON-LD blocks contain invalid JSON. Search engines cannot parse this data.',
        'Check your JSON-LD blocks for syntax errors. Validate at https://validator.schema.org/'));
    }
  });

  data.schemas = schemas;
  data.schemaTypes = Array.from(schemaTypes);
  data.jsonLdCount = jsonLdScripts.length;

  // === NO STRUCTURED DATA ===
  if (schemas.length === 0) {
    issues.push(createIssue('SCHEMA_MISSING', Category.TECHNICAL, Severity.WARNING,
      'No structured data found',
      'Structured data helps search engines understand your content and can enable rich snippets.',
      'Add JSON-LD structured data. For Shopify, add Product, BreadcrumbList, and Organization schema.'));
    return { issues, data };
  }

  issues.push(createIssue('SCHEMA_FOUND', Category.TECHNICAL, Severity.PASS,
    `${schemas.length} structured data block(s) found`, '', ''));

  // === PRODUCT SCHEMA ===
  const productSchema = schemas.find(s => s['@type'] === 'Product');
  data.hasProductSchema = !!productSchema;

  if (productSchema) {
    // Check required Product fields
    const missingFields = [];
    if (!productSchema.name) missingFields.push('name');
    if (!productSchema.image) missingFields.push('image');
    if (!productSchema.description) missingFields.push('description');

    if (missingFields.length > 0) {
      issues.push(createIssue('SCHEMA_PRODUCT_INCOMPLETE', Category.TECHNICAL, Severity.WARNING,
        `Product schema missing: ${missingFields.join(', ')}`,
        'Incomplete product schema reduces chances of rich snippets in search results.',
        'Add the missing fields to your Product structured data.'));
    }

    // Check offers
    const offers = productSchema.offers || productSchema.offer;
    if (!offers) {
      issues.push(createIssue('SCHEMA_PRODUCT_NO_OFFERS', Category.TECHNICAL, Severity.CRITICAL,
        'Product schema missing offers/pricing',
        'Without offers, Google cannot show price in search results.',
        'Add an "offers" object with price, priceCurrency, and availability to your Product schema.'));
    } else {
      const offerObj = Array.isArray(offers) ? offers[0] : offers;
      if (offerObj) {
        if (!offerObj.price && !offerObj.lowPrice) {
          issues.push(createIssue('SCHEMA_PRODUCT_NO_PRICE', Category.TECHNICAL, Severity.WARNING,
            'Product offers missing price', '', 'Add price to your offers structured data.'));
        }
        if (!offerObj.priceCurrency) {
          issues.push(createIssue('SCHEMA_PRODUCT_NO_CURRENCY', Category.TECHNICAL, Severity.WARNING,
            'Product offers missing priceCurrency', '', 'Add priceCurrency (e.g., "USD") to offers.'));
        }
        if (!offerObj.availability) {
          issues.push(createIssue('SCHEMA_PRODUCT_NO_AVAILABILITY', Category.TECHNICAL, Severity.INFO,
            'Product offers missing availability', '', 'Add availability (e.g., "https://schema.org/InStock") to offers.'));
        }
      }
    }

    // Check for reviews/ratings
    if (!productSchema.aggregateRating && !productSchema.review) {
      issues.push(createIssue('SCHEMA_PRODUCT_NO_REVIEWS', Category.TECHNICAL, Severity.INFO,
        'Product schema has no reviews or ratings',
        'Review stars in search results significantly improve click-through rates.',
        'Add aggregateRating or review data to your Product schema. Many Shopify review apps add this automatically.'));
    }

    // Check SKU/GTIN
    if (!productSchema.sku && !productSchema.gtin && !productSchema.gtin13 && !productSchema.mpn) {
      issues.push(createIssue('SCHEMA_PRODUCT_NO_IDENTIFIER', Category.TECHNICAL, Severity.INFO,
        'Product schema missing unique identifier (SKU/GTIN)',
        'Product identifiers help Google match your products in Shopping results.',
        'Add sku, gtin, or mpn to your Product schema.'));
    }
  }

  // === BREADCRUMB SCHEMA ===
  const hasBreadcrumb = schemas.some(s => s['@type'] === 'BreadcrumbList');
  data.hasBreadcrumbSchema = hasBreadcrumb;

  if (!hasBreadcrumb) {
    issues.push(createIssue('SCHEMA_BREADCRUMB_MISSING', Category.TECHNICAL, Severity.INFO,
      'No BreadcrumbList schema found',
      'Breadcrumb schema helps Google show breadcrumb navigation in search results.',
      'Add BreadcrumbList structured data matching your page\'s breadcrumb navigation.'));
  }

  // === ORGANIZATION SCHEMA ===
  const hasOrg = schemas.some(s => s['@type'] === 'Organization' || s['@type'] === 'LocalBusiness');
  data.hasOrganizationSchema = hasOrg;

  // === WEBSITE SCHEMA ===
  const webSiteSchema = schemas.find(s => s['@type'] === 'WebSite');
  data.hasWebSiteSchema = !!webSiteSchema;

  if (webSiteSchema && !webSiteSchema.potentialAction) {
    issues.push(createIssue('SCHEMA_WEBSITE_NO_SEARCH', Category.TECHNICAL, Severity.INFO,
      'WebSite schema missing SearchAction',
      'SearchAction enables a sitelinks search box in Google results.',
      'Add a potentialAction with SearchAction type to your WebSite schema.'));
  }

  // === DUPLICATE SCHEMA DETECTION ===
  const typeCount = {};
  schemas.forEach(s => {
    const type = s['@type'];
    if (type) typeCount[type] = (typeCount[type] || 0) + 1;
  });

  for (const [type, count] of Object.entries(typeCount)) {
    if (count > 1 && ['Product', 'Organization', 'WebSite'].includes(type)) {
      issues.push(createIssue('SCHEMA_DUPLICATE', Category.TECHNICAL, Severity.WARNING,
        `Duplicate ${type} schema detected (${count} instances)`,
        'Multiple schema blocks of the same type can confuse search engines. This often happens when a Shopify app adds schema that conflicts with theme schema.',
        `Remove the duplicate ${type} schema. Check your theme code and installed apps for conflicting structured data.`));
    }
  }

  return { issues, data };
}
