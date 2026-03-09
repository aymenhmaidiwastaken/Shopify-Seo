/**
 * Content Analyzer
 * Word count, readability, keyword density
 */

import { Category, Severity, createIssue } from '../../shared/types.js';

export function analyzeContent(doc) {
  const issues = [];
  const data = {};

  // Extract visible text content (exclude scripts, styles, nav, footer)
  const bodyClone = doc.body.cloneNode(true);
  bodyClone.querySelectorAll('script, style, noscript, nav, footer, header').forEach(el => el.remove());
  const text = bodyClone.textContent?.replace(/\s+/g, ' ').trim() || '';

  const words = text.split(/\s+/).filter(w => w.length > 0);
  data.wordCount = words.length;
  data.characterCount = text.length;

  // === WORD COUNT ===
  if (words.length < 100) {
    issues.push(createIssue('CONTENT_THIN', Category.CONTENT, Severity.CRITICAL,
      `Thin content: only ${words.length} words`,
      'Pages with very little content struggle to rank. Search engines prefer comprehensive content.',
      'Add more descriptive content. For product pages, aim for 150+ words. For blog posts, aim for 1000+ words.'));
  } else if (words.length < 300) {
    issues.push(createIssue('CONTENT_LOW', Category.CONTENT, Severity.WARNING,
      `Low word count: ${words.length} words`,
      'While there\'s no strict minimum, pages with more content tend to rank better.',
      'Consider adding more detailed descriptions, FAQs, or related information.'));
  } else {
    issues.push(createIssue('CONTENT_OK', Category.CONTENT, Severity.PASS,
      `Good content length: ${words.length} words`, '', ''));
  }

  // === READABILITY (Simplified Flesch-Kincaid) ===
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  data.sentenceCount = sentences.length;

  if (sentences.length > 0 && words.length > 30) {
    const avgWordsPerSentence = words.length / sentences.length;
    const syllableCount = words.reduce((count, word) => count + countSyllables(word), 0);
    const avgSyllablesPerWord = syllableCount / words.length;

    // Flesch Reading Ease (higher = easier)
    const fleschScore = Math.round(206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord));
    data.readabilityScore = Math.max(0, Math.min(100, fleschScore));
    data.avgWordsPerSentence = Math.round(avgWordsPerSentence * 10) / 10;

    if (fleschScore < 30) {
      issues.push(createIssue('READABILITY_HARD', Category.CONTENT, Severity.WARNING,
        `Content is difficult to read (score: ${data.readabilityScore}/100)`,
        'Very complex content can drive users away and increase bounce rates.',
        'Simplify your writing. Use shorter sentences, simpler words, and break up long paragraphs.'));
    } else if (fleschScore < 50) {
      issues.push(createIssue('READABILITY_MEDIUM', Category.CONTENT, Severity.INFO,
        `Content readability is moderate (score: ${data.readabilityScore}/100)`,
        'Consider simplifying for a broader audience.',
        'Target a readability score of 60-70 for general e-commerce content.'));
    } else {
      issues.push(createIssue('READABILITY_OK', Category.CONTENT, Severity.PASS,
        `Good readability (score: ${data.readabilityScore}/100)`, '', ''));
    }
  }

  // === KEYWORD DENSITY (top words) ===
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
    'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall',
    'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'me',
    'him', 'her', 'us', 'them', 'my', 'your', 'his', 'our', 'their', 'not', 'no', 'so', 'if',
    'as', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'only',
    'own', 'same', 'than', 'too', 'very', 'just', 'about', 'up', 'out', 'also', 'how', 'what',
    'when', 'where', 'who', 'which', 'why', 'get', 'got', 'am', 'any', 'here', 'there']);

  const wordFreq = {};
  words.forEach(w => {
    const lower = w.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (lower.length > 2 && !stopWords.has(lower)) {
      wordFreq[lower] = (wordFreq[lower] || 0) + 1;
    }
  });

  const topKeywords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word, count]) => ({
      word,
      count,
      density: Math.round((count / words.length) * 10000) / 100
    }));

  data.topKeywords = topKeywords;

  // Check for keyword stuffing
  const stuffed = topKeywords.filter(k => k.density > 5);
  if (stuffed.length > 0) {
    issues.push(createIssue('KEYWORD_STUFFING', Category.CONTENT, Severity.WARNING,
      `Possible keyword stuffing: "${stuffed[0].word}" (${stuffed[0].density}% density)`,
      'Keyword density above 3-5% can be seen as spammy by search engines.',
      'Reduce keyword repetition and use natural language. Include synonyms and related terms.'));
  }

  // === PARAGRAPHS ===
  const paragraphs = doc.querySelectorAll('p');
  data.paragraphCount = paragraphs.length;

  if (paragraphs.length === 0 && words.length > 50) {
    issues.push(createIssue('NO_PARAGRAPHS', Category.CONTENT, Severity.INFO,
      'No <p> paragraph tags found',
      'Content should be structured in paragraphs for readability and SEO.',
      'Wrap text content in <p> tags for proper semantic structure.'));
  }

  return { issues, data };
}

function countSyllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}
