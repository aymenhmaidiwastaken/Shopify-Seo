/**
 * Images Analyzer
 * Checks alt tags, file sizes, lazy loading, WebP/AVIF usage, dimensions
 */

import { Category, Severity, createIssue } from '../../shared/types.js';

export function analyzeImages(doc) {
  const issues = [];
  const data = {};

  const images = Array.from(doc.querySelectorAll('img'));
  data.totalImages = images.length;

  if (images.length === 0) {
    data.imageDetails = [];
    return { issues, data };
  }

  const imageDetails = [];
  let missingAlt = 0;
  let emptyAlt = 0;
  let missingDimensions = 0;
  let lazyLoaded = 0;
  let modernFormat = 0;

  images.forEach((img, i) => {
    const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
    const alt = img.getAttribute('alt');
    const hasAlt = alt !== null;
    const altText = alt?.trim() || '';
    const width = img.getAttribute('width');
    const height = img.getAttribute('height');
    const loading = img.getAttribute('loading');
    const isLazy = loading === 'lazy' || img.hasAttribute('data-src') || img.classList.contains('lazyload');

    // Detect modern formats
    const srcLower = src.toLowerCase();
    const isModern = srcLower.includes('.webp') || srcLower.includes('.avif') ||
      srcLower.includes('format=webp') || srcLower.includes('format=avif');

    if (!hasAlt) missingAlt++;
    else if (!altText) emptyAlt++;
    if (!width || !height) missingDimensions++;
    if (isLazy) lazyLoaded++;
    if (isModern) modernFormat++;

    imageDetails.push({
      index: i,
      src: src.substring(0, 200),
      alt: altText,
      hasAlt,
      width,
      height,
      isLazy,
      isModern
    });
  });

  data.imageDetails = imageDetails;
  data.missingAlt = missingAlt;
  data.emptyAlt = emptyAlt;
  data.missingDimensions = missingDimensions;
  data.lazyLoaded = lazyLoaded;
  data.modernFormat = modernFormat;

  // === ALT TAGS ===
  if (missingAlt > 0) {
    const severity = missingAlt > 5 ? Severity.CRITICAL : Severity.WARNING;
    issues.push(createIssue('IMG_ALT_MISSING', Category.IMAGES, severity,
      `${missingAlt} image(s) missing alt attribute`,
      'Images without alt attributes hurt accessibility and miss SEO keyword opportunities.',
      'Add descriptive alt text to all images. Describe what the image shows and include relevant keywords naturally.'));
  } else {
    issues.push(createIssue('IMG_ALT_OK', Category.IMAGES, Severity.PASS,
      'All images have alt attributes', '', ''));
  }

  if (emptyAlt > 3) {
    issues.push(createIssue('IMG_ALT_EMPTY', Category.IMAGES, Severity.INFO,
      `${emptyAlt} image(s) have empty alt attributes`,
      'Empty alt attributes are acceptable for decorative images, but content images should have descriptive alt text.',
      'Review images with empty alt="" and add descriptions for content images.'));
  }

  // === DIMENSIONS ===
  if (missingDimensions > 0) {
    issues.push(createIssue('IMG_DIMENSIONS_MISSING', Category.IMAGES, Severity.WARNING,
      `${missingDimensions} image(s) missing width/height`,
      'Missing dimensions cause layout shifts (CLS) as images load, hurting Core Web Vitals.',
      'Add explicit width and height attributes to all images, or use CSS aspect-ratio.'));
  } else {
    issues.push(createIssue('IMG_DIMENSIONS_OK', Category.IMAGES, Severity.PASS,
      'All images have width/height set', '', ''));
  }

  // === LAZY LOADING ===
  const nonLazy = images.length - lazyLoaded;
  if (images.length > 3 && lazyLoaded < images.length * 0.5) {
    issues.push(createIssue('IMG_LAZY_LOW', Category.IMAGES, Severity.WARNING,
      `Only ${lazyLoaded} of ${images.length} images use lazy loading`,
      'Lazy loading defers off-screen images, improving initial page load speed.',
      'Add loading="lazy" to images below the fold. Keep above-fold images eager-loaded.'));
  } else if (images.length > 3) {
    issues.push(createIssue('IMG_LAZY_OK', Category.IMAGES, Severity.PASS,
      'Good lazy loading coverage', '', ''));
  }

  // === MODERN FORMATS ===
  if (images.length > 2 && modernFormat < images.length * 0.3) {
    issues.push(createIssue('IMG_FORMAT_OLD', Category.IMAGES, Severity.INFO,
      `Only ${modernFormat} of ${images.length} images use modern formats`,
      'WebP and AVIF images are 25-50% smaller than JPEG/PNG with similar quality.',
      'Convert images to WebP format. Shopify automatically serves WebP when you use the | image_url filter with format parameter.'));
  }

  return { issues, data };
}
