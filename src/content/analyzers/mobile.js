/**
 * Mobile-Friendliness Analyzer
 * Viewport, tap targets, font sizes, responsive indicators
 */

import { Category, Severity, createIssue } from '../../shared/types.js';

export function analyzeMobile(doc) {
  const issues = [];
  const data = {};

  // === VIEWPORT META ===
  const viewport = doc.querySelector('meta[name="viewport"]');
  const viewportContent = viewport?.getAttribute('content') || '';
  data.viewport = viewportContent;

  if (!viewport) {
    issues.push(createIssue('MOBILE_NO_VIEWPORT', Category.PERFORMANCE, Severity.CRITICAL,
      'No viewport meta tag',
      'Mobile devices will render this page at desktop width without a viewport tag.',
      'Add <meta name="viewport" content="width=device-width, initial-scale=1">.'));
  } else if (!viewportContent.includes('width=device-width')) {
    issues.push(createIssue('MOBILE_VIEWPORT_FIXED', Category.PERFORMANCE, Severity.WARNING,
      'Viewport does not use device-width',
      'A fixed-width viewport prevents proper responsive behavior.',
      'Change viewport to include width=device-width.'));
  }

  if (viewportContent.includes('maximum-scale=1') || viewportContent.includes('user-scalable=no')) {
    issues.push(createIssue('MOBILE_ZOOM_DISABLED', Category.PERFORMANCE, Severity.WARNING,
      'Pinch-to-zoom is disabled',
      'Disabling zoom hurts accessibility and is a negative signal for mobile usability.',
      'Remove maximum-scale=1 and user-scalable=no from your viewport meta tag.'));
  }

  // === SMALL FONT SIZES ===
  // Check for very small explicit font sizes
  const smallFontElements = doc.querySelectorAll('[style*="font-size"]');
  let tinyFonts = 0;
  smallFontElements.forEach(el => {
    const style = el.getAttribute('style') || '';
    const match = style.match(/font-size:\s*(\d+)px/);
    if (match && parseInt(match[1]) < 12) {
      tinyFonts++;
    }
  });
  data.tinyFontElements = tinyFonts;

  if (tinyFonts > 3) {
    issues.push(createIssue('MOBILE_TINY_FONTS', Category.PERFORMANCE, Severity.INFO,
      `${tinyFonts} elements with very small font sizes (<12px)`,
      'Small fonts are hard to read on mobile devices.',
      'Use a minimum font size of 16px for body text on mobile.'));
  }

  // === RESPONSIVE IMAGES ===
  const images = doc.querySelectorAll('img');
  let fixedWidthImages = 0;
  images.forEach(img => {
    const width = img.getAttribute('width');
    const style = img.getAttribute('style') || '';
    if (width && parseInt(width) > 500 && !style.includes('max-width')) {
      fixedWidthImages++;
    }
  });
  data.fixedWidthImages = fixedWidthImages;

  if (fixedWidthImages > 0) {
    issues.push(createIssue('MOBILE_FIXED_IMAGES', Category.PERFORMANCE, Severity.INFO,
      `${fixedWidthImages} image(s) with large fixed widths`,
      'Images with fixed widths may overflow on small screens.',
      'Use max-width: 100% on images or use responsive image techniques.'));
  }

  // === TOUCH TARGETS ===
  const buttons = doc.querySelectorAll('button, [role="button"], input[type="submit"]');
  data.touchTargets = buttons.length;

  // === HORIZONTAL SCROLL INDICATORS ===
  const wideElements = doc.querySelectorAll('table:not([style*="overflow"]), pre');
  data.potentialScrollElements = wideElements.length;

  if (wideElements.length > 0) {
    issues.push(createIssue('MOBILE_HORIZONTAL_SCROLL', Category.PERFORMANCE, Severity.INFO,
      `${wideElements.length} element(s) that may cause horizontal scroll`,
      'Tables and preformatted text can cause horizontal scrolling on mobile.',
      'Wrap tables in a scrollable container or make them responsive.'));
  }

  return { issues, data };
}
