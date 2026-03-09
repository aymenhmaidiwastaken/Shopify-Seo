/**
 * Scoring Engine - Computes weighted SEO scores from analysis results
 */

import { Category, CategoryWeights, Severity, SeverityPenalty } from './types.js';

export function computeCategoryScore(issues) {
  let penalty = 0;
  for (const issue of issues) {
    if (issue.severity !== Severity.PASS) {
      penalty += SeverityPenalty[issue.severity] || 0;
    }
  }
  return Math.max(0, Math.min(100, 100 - penalty));
}

export function computeOverallScore(categoryScores, isShopify = true) {
  let weights = { ...CategoryWeights };

  // Redistribute Shopify weight if not a Shopify site
  if (!isShopify) {
    const shopifyWeight = weights[Category.SHOPIFY];
    delete weights[Category.SHOPIFY];
    const remaining = Object.keys(weights);
    const extra = shopifyWeight / remaining.length;
    for (const key of remaining) {
      weights[key] += extra;
    }
  }

  let totalWeight = 0;
  let weightedSum = 0;

  for (const [category, weight] of Object.entries(weights)) {
    if (categoryScores[category] !== undefined) {
      weightedSum += categoryScores[category] * weight;
      totalWeight += weight;
    }
  }

  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}

export function computeAllScores(issuesByCategory, isShopify = true) {
  const categoryScores = {};

  for (const [category, issues] of Object.entries(issuesByCategory)) {
    categoryScores[category] = computeCategoryScore(issues);
  }

  const overallScore = computeOverallScore(categoryScores, isShopify);

  return { overallScore, categoryScores };
}
