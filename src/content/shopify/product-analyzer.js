/**
 * Shopify Product Page Analyzer
 * Product-specific SEO checks
 */

import { Category, Severity, createIssue } from '../../shared/types.js';

export function analyzeProductPage(doc, url) {
  const issues = [];
  const data = {};

  // === PRODUCT DESCRIPTION ===
  const descriptionEl = doc.querySelector('.product-description, .product__description, [data-product-description], .product-single__description, .rte');
  const descriptionText = descriptionEl?.textContent?.trim() || '';
  const descWords = descriptionText.split(/\s+/).filter(w => w.length > 0).length;
  data.productDescriptionWords = descWords;

  if (descWords < 50) {
    issues.push(createIssue('SHOPIFY_PRODUCT_DESC_SHORT', Category.SHOPIFY, Severity.CRITICAL,
      `Product description very short (${descWords} words)`,
      'Short product descriptions miss ranking opportunities. Google needs content to understand what you sell.',
      'Write a detailed product description of 150+ words. Include features, benefits, materials, sizing, and use cases.'));
  } else if (descWords < 150) {
    issues.push(createIssue('SHOPIFY_PRODUCT_DESC_MEDIUM', Category.SHOPIFY, Severity.WARNING,
      `Product description could be longer (${descWords} words)`,
      'Longer, more detailed descriptions tend to rank better.',
      'Expand your description. Add bullet points for features, a sizing guide, care instructions, or FAQ section.'));
  } else {
    issues.push(createIssue('SHOPIFY_PRODUCT_DESC_OK', Category.SHOPIFY, Severity.PASS,
      `Good product description length (${descWords} words)`, '', ''));
  }

  // === PRODUCT IMAGES ===
  const productImages = doc.querySelectorAll('.product-image img, .product__media img, [data-product-media] img, .product-single__photo img, .product__photo img');
  data.productImageCount = productImages.length;

  if (productImages.length === 0) {
    // Try broader selector
    const mainImages = doc.querySelectorAll('.product img, [data-product] img');
    data.productImageCount = mainImages.length;
  }

  let imagesWithoutAlt = 0;
  productImages.forEach(img => {
    if (!img.getAttribute('alt')?.trim()) imagesWithoutAlt++;
  });

  if (imagesWithoutAlt > 0) {
    issues.push(createIssue('SHOPIFY_PRODUCT_IMG_ALT', Category.SHOPIFY, Severity.WARNING,
      `${imagesWithoutAlt} product image(s) missing alt text`,
      'Product image alt text should include the product name and key details for image search visibility.',
      'Add descriptive alt text: "[Product Name] - [Color/Variant] - [Key Feature]"'));
  }

  if (data.productImageCount < 3) {
    issues.push(createIssue('SHOPIFY_PRODUCT_FEW_IMAGES', Category.SHOPIFY, Severity.INFO,
      `Only ${data.productImageCount} product image(s)`,
      'Multiple product images from different angles improve conversion and image search visibility.',
      'Add at least 3-5 product images showing different angles, details, and lifestyle shots.'));
  }

  // === VARIANT URL ISSUES ===
  const currentUrl = new URL(url);
  if (currentUrl.searchParams.has('variant')) {
    const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
    if (canonical.includes('variant=')) {
      issues.push(createIssue('SHOPIFY_VARIANT_CANONICAL', Category.SHOPIFY, Severity.CRITICAL,
        'Canonical tag includes variant parameter',
        'Variant URLs should canonicalize to the base product URL to avoid duplicate content.',
        'Update your theme to remove variant parameters from canonical tags. The canonical should point to the base product URL.'));
    }
  }

  // === PRODUCT HANDLE ===
  const pathParts = window.location.pathname.split('/');
  const handle = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
  data.productHandle = handle;

  if (handle && handle.match(/^[a-f0-9]{8,}$/i)) {
    issues.push(createIssue('SHOPIFY_HANDLE_AUTO', Category.SHOPIFY, Severity.WARNING,
      'Product handle appears auto-generated',
      'Auto-generated handles are not descriptive and miss keyword opportunities.',
      'Edit the product URL handle in Shopify Admin to include descriptive keywords. Example: "blue-cotton-tshirt" instead of "product-123".'));
  }

  // === PRICE DISPLAY ===
  const priceEl = doc.querySelector('.price, .product-price, .product__price, [data-product-price], .money');
  data.hasPriceVisible = !!priceEl;

  if (!priceEl) {
    issues.push(createIssue('SHOPIFY_PRICE_HIDDEN', Category.SHOPIFY, Severity.INFO,
      'No visible price element detected',
      'Visible pricing helps search engines understand product pages and can improve rich snippets.',
      'Ensure product price is visible in the HTML (not rendered only via JavaScript).'));
  }

  // === REVIEWS SECTION ===
  const reviewSection = doc.querySelector('[data-reviews], .product-reviews, .spr-container, .yotpo, .stamped-container, .judgeme, .loox-reviews');
  data.hasReviews = !!reviewSection;

  if (!reviewSection) {
    issues.push(createIssue('SHOPIFY_NO_REVIEWS', Category.SHOPIFY, Severity.INFO,
      'No review section detected',
      'Product reviews add unique content, build trust, and enable review stars in search results.',
      'Install a review app (Judge.me, Stamped, Yotpo) and encourage customers to leave reviews.'));
  }

  // === ADD TO CART BUTTON ===
  const addToCartBtn = doc.querySelector('[name="add"], .add-to-cart, .product-form__submit, button[type="submit"][name="add"]');
  data.hasAddToCart = !!addToCartBtn;

  return { issues, data };
}
