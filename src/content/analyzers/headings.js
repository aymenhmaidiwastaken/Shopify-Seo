/**
 * Headings Analyzer
 * Validates H1-H6 hierarchy, count, content quality
 */

import { Category, Severity, createIssue } from '../../shared/types.js';

export function analyzeHeadings(doc) {
  const issues = [];
  const data = {};

  const headings = [];
  doc.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
    headings.push({
      level: parseInt(h.tagName[1]),
      text: h.textContent?.trim() || '',
      element: h.tagName
    });
  });

  data.headings = headings;
  data.headingCounts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };

  headings.forEach(h => {
    data.headingCounts[`h${h.level}`]++;
  });

  // === H1 CHECK ===
  const h1Count = data.headingCounts.h1;

  if (h1Count === 0) {
    issues.push(createIssue('H1_MISSING', Category.CONTENT, Severity.CRITICAL,
      'Missing H1 heading',
      'Every page should have exactly one H1 tag that describes the main topic.',
      'Add a single H1 heading that includes your primary keyword for this page.'));
  } else if (h1Count > 1) {
    issues.push(createIssue('H1_MULTIPLE', Category.CONTENT, Severity.WARNING,
      `Multiple H1 tags found (${h1Count})`,
      'Having multiple H1 tags can confuse search engines about the page\'s main topic.',
      'Keep only one H1 tag per page. Convert extra H1s to H2 or other appropriate heading levels.'));
  } else {
    const h1Text = headings.find(h => h.level === 1)?.text || '';
    if (h1Text.length < 10) {
      issues.push(createIssue('H1_SHORT', Category.CONTENT, Severity.WARNING,
        'H1 heading is very short',
        `Your H1 "${h1Text}" is only ${h1Text.length} characters. Short H1s miss keyword opportunities.`,
        'Make your H1 more descriptive. Include your primary keyword naturally.'));
    } else if (h1Text.length > 70) {
      issues.push(createIssue('H1_LONG', Category.CONTENT, Severity.INFO,
        'H1 heading is long',
        `Your H1 is ${h1Text.length} characters. Very long H1s can dilute keyword focus.`,
        'Consider shortening your H1 to be more focused and impactful.'));
    } else {
      issues.push(createIssue('H1_OK', Category.CONTENT, Severity.PASS,
        'H1 heading is well-structured', '', ''));
    }
  }

  // === HIERARCHY CHECK ===
  let hasSkip = false;
  for (let i = 1; i < headings.length; i++) {
    const prev = headings[i - 1].level;
    const curr = headings[i].level;
    if (curr > prev + 1) {
      hasSkip = true;
      break;
    }
  }

  if (hasSkip) {
    issues.push(createIssue('HEADING_SKIP', Category.CONTENT, Severity.WARNING,
      'Heading hierarchy has skipped levels',
      'Jumping from H1 to H3 (skipping H2) or similar breaks the document outline.',
      'Ensure headings follow a logical order: H1 > H2 > H3, without skipping levels.'));
  } else if (headings.length > 1) {
    issues.push(createIssue('HEADING_HIERARCHY_OK', Category.CONTENT, Severity.PASS,
      'Heading hierarchy is correct', '', ''));
  }

  // === EMPTY HEADINGS ===
  const emptyHeadings = headings.filter(h => !h.text);
  if (emptyHeadings.length > 0) {
    issues.push(createIssue('HEADING_EMPTY', Category.CONTENT, Severity.WARNING,
      `${emptyHeadings.length} empty heading(s) found`,
      'Empty headings create gaps in the document outline and provide no SEO value.',
      'Either add content to empty headings or remove them entirely.'));
  }

  // === TOTAL HEADING COUNT ===
  if (headings.length === 0) {
    issues.push(createIssue('NO_HEADINGS', Category.CONTENT, Severity.WARNING,
      'No headings found on page',
      'Headings help search engines understand content structure and hierarchy.',
      'Add relevant headings (H1-H6) to structure your content properly.'));
  }

  return { issues, data };
}
