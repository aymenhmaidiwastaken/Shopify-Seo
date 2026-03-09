/**
 * Meta Tags Analyzer
 * Checks title, description, Open Graph, Twitter Cards, viewport, charset
 */

import { Category, Severity, createIssue } from '../../shared/types.js';

export function analyzeMetaTags(doc, url) {
  const issues = [];
  const data = {};

  // === TITLE ===
  const title = doc.querySelector('title')?.textContent?.trim() || '';
  data.title = title;
  data.titleLength = title.length;

  if (!title) {
    issues.push(createIssue('META_TITLE_MISSING', Category.META, Severity.CRITICAL,
      'Missing page title',
      'The page has no <title> tag. This is the most important on-page SEO element.',
      'Add a unique, descriptive <title> tag between 50-60 characters that includes your target keyword.'));
  } else if (title.length < 30) {
    issues.push(createIssue('META_TITLE_SHORT', Category.META, Severity.WARNING,
      `Title too short (${title.length} chars)`,
      'Short titles miss opportunities to include keywords and attract clicks.',
      'Expand your title to 50-60 characters with relevant keywords.'));
  } else if (title.length > 60) {
    issues.push(createIssue('META_TITLE_LONG', Category.META, Severity.WARNING,
      `Title too long (${title.length} chars)`,
      'Titles over 60 characters get truncated in search results.',
      'Shorten your title to 50-60 characters. Put the most important keywords first.'));
  } else {
    issues.push(createIssue('META_TITLE_OK', Category.META, Severity.PASS,
      'Title tag is well-optimized',
      `Title is ${title.length} characters, within the optimal range.`, ''));
  }

  // === META DESCRIPTION ===
  const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';
  data.metaDescription = metaDesc;
  data.metaDescriptionLength = metaDesc.length;

  if (!metaDesc) {
    issues.push(createIssue('META_DESC_MISSING', Category.META, Severity.CRITICAL,
      'Missing meta description',
      'No meta description found. Google may generate one from page content, but it\'s better to control it.',
      'Add a compelling meta description (150-160 characters) that includes your target keyword and a call to action.'));
  } else if (metaDesc.length < 120) {
    issues.push(createIssue('META_DESC_SHORT', Category.META, Severity.WARNING,
      `Meta description too short (${metaDesc.length} chars)`,
      'Short descriptions don\'t fully utilize the space available in search results.',
      'Expand to 150-160 characters with a compelling description including keywords.'));
  } else if (metaDesc.length > 160) {
    issues.push(createIssue('META_DESC_LONG', Category.META, Severity.WARNING,
      `Meta description too long (${metaDesc.length} chars)`,
      'Descriptions over 160 characters get truncated in search results.',
      'Trim to 150-160 characters. Make sure the key message is in the first 150 characters.'));
  } else {
    issues.push(createIssue('META_DESC_OK', Category.META, Severity.PASS,
      'Meta description is well-optimized', '', ''));
  }

  // === OPEN GRAPH ===
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
    issues.push(createIssue('OG_TAGS_MISSING', Category.META, Severity.WARNING,
      `Missing Open Graph tags: ${missing.join(', ')}`,
      'Open Graph tags control how your page appears when shared on Facebook, LinkedIn, and other platforms.',
      'Add the missing OG tags. At minimum, include og:title, og:description, and og:image (1200x630px recommended).'));
  } else {
    issues.push(createIssue('OG_TAGS_OK', Category.META, Severity.PASS,
      'Open Graph tags are present', '', ''));
  }

  if (!ogUrl) {
    issues.push(createIssue('OG_URL_MISSING', Category.META, Severity.INFO,
      'Missing og:url tag',
      'Without og:url, social platforms may not canonicalize shares correctly.',
      'Add <meta property="og:url" content="[canonical URL]"> to your page.'));
  }

  // === TWITTER CARDS ===
  const twCard = doc.querySelector('meta[name="twitter:card"]')?.getAttribute('content') || '';
  const twTitle = doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content') || '';
  const twDesc = doc.querySelector('meta[name="twitter:description"]')?.getAttribute('content') || '';
  const twImage = doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content') || '';

  data.twitter = { card: twCard, title: twTitle, description: twDesc, image: twImage };

  if (!twCard) {
    issues.push(createIssue('TWITTER_CARD_MISSING', Category.META, Severity.INFO,
      'Missing Twitter Card tags',
      'Twitter Cards enhance how your links appear on Twitter/X.',
      'Add <meta name="twitter:card" content="summary_large_image"> along with twitter:title, twitter:description, and twitter:image.'));
  } else {
    issues.push(createIssue('TWITTER_CARD_OK', Category.META, Severity.PASS,
      'Twitter Card tags are present', '', ''));
  }

  // === VIEWPORT ===
  const viewport = doc.querySelector('meta[name="viewport"]')?.getAttribute('content') || '';
  data.viewport = viewport;

  if (!viewport) {
    issues.push(createIssue('VIEWPORT_MISSING', Category.META, Severity.CRITICAL,
      'Missing viewport meta tag',
      'Without a viewport tag, mobile devices will render the page at desktop width.',
      'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the <head>.'));
  } else {
    issues.push(createIssue('VIEWPORT_OK', Category.META, Severity.PASS,
      'Viewport meta tag is present', '', ''));
  }

  // === CHARSET ===
  const charset = doc.querySelector('meta[charset]') || doc.querySelector('meta[http-equiv="Content-Type"]');
  data.hasCharset = !!charset;

  if (!charset) {
    issues.push(createIssue('CHARSET_MISSING', Category.META, Severity.INFO,
      'Missing charset declaration',
      'Declaring charset ensures proper text rendering.',
      'Add <meta charset="UTF-8"> as the first element in <head>.'));
  }

  // === LANGUAGE ===
  const htmlLang = doc.documentElement.getAttribute('lang') || '';
  data.language = htmlLang;

  if (!htmlLang) {
    issues.push(createIssue('LANG_MISSING', Category.META, Severity.WARNING,
      'Missing lang attribute on <html>',
      'The lang attribute helps search engines understand the page language and improves accessibility.',
      'Add lang="en" (or appropriate language code) to your <html> tag.'));
  }

  return { issues, data };
}
