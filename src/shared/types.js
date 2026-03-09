/**
 * Shared type definitions and constants for ShopifySEO Pro
 */

export const Severity = {
  CRITICAL: 'critical',
  WARNING: 'warning',
  INFO: 'info',
  PASS: 'pass'
};

export const Category = {
  META: 'meta',
  CONTENT: 'content',
  TECHNICAL: 'technical',
  IMAGES: 'images',
  LINKS: 'links',
  PERFORMANCE: 'performance',
  SHOPIFY: 'shopify'
};

export const CategoryLabels = {
  [Category.META]: 'Meta Tags & Social',
  [Category.CONTENT]: 'Content & Headings',
  [Category.TECHNICAL]: 'Technical SEO',
  [Category.IMAGES]: 'Image Optimization',
  [Category.LINKS]: 'Links & Navigation',
  [Category.PERFORMANCE]: 'Performance',
  [Category.SHOPIFY]: 'Shopify-Specific'
};

export const CategoryWeights = {
  [Category.META]: 0.20,
  [Category.CONTENT]: 0.15,
  [Category.TECHNICAL]: 0.20,
  [Category.IMAGES]: 0.10,
  [Category.LINKS]: 0.10,
  [Category.PERFORMANCE]: 0.10,
  [Category.SHOPIFY]: 0.15
};

export const SeverityPenalty = {
  [Severity.CRITICAL]: 20,
  [Severity.WARNING]: 8,
  [Severity.INFO]: 2,
  [Severity.PASS]: 0
};

export function getGrade(score) {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'B+';
  if (score >= 80) return 'B';
  if (score >= 75) return 'C+';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export function getScoreColor(score) {
  if (score >= 90) return '#22c55e';
  if (score >= 70) return '#eab308';
  if (score >= 50) return '#f97316';
  return '#ef4444';
}

export function getSeverityColor(severity) {
  switch (severity) {
    case Severity.CRITICAL: return '#ef4444';
    case Severity.WARNING: return '#eab308';
    case Severity.INFO: return '#3b82f6';
    case Severity.PASS: return '#22c55e';
    default: return '#6b7280';
  }
}

export function createIssue(id, category, severity, title, description, recommendation, element = null) {
  return { id, category, severity, title, description, recommendation, element };
}
