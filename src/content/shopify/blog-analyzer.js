/**
 * Shopify Blog Post Analyzer
 */

import { Category, Severity, createIssue } from '../../shared/types.js';

export function analyzeBlogPost(doc) {
  const issues = [];
  const data = {};

  // === ARTICLE CONTENT ===
  const articleEl = doc.querySelector('article, .article, .blog-post, .article__content, [data-article]');
  const articleText = articleEl?.textContent?.trim() || '';
  const wordCount = articleText.split(/\s+/).filter(w => w.length > 0).length;
  data.articleWordCount = wordCount;

  if (wordCount < 300) {
    issues.push(createIssue('SHOPIFY_BLOG_SHORT', Category.SHOPIFY, Severity.WARNING,
      `Blog post is short (${wordCount} words)`,
      'Blog posts under 300 words rarely rank well. Longer, comprehensive content performs better.',
      'Aim for 1000-2000+ words. Cover the topic thoroughly with sections, images, and actionable advice.'));
  } else if (wordCount < 800) {
    issues.push(createIssue('SHOPIFY_BLOG_MEDIUM', Category.SHOPIFY, Severity.INFO,
      `Blog post is ${wordCount} words`,
      'While acceptable, longer posts (1500+) tend to rank better for competitive keywords.',
      'Consider expanding the post with more detail, examples, or an FAQ section.'));
  } else {
    issues.push(createIssue('SHOPIFY_BLOG_LENGTH_OK', Category.SHOPIFY, Severity.PASS,
      `Good blog post length (${wordCount} words)`, '', ''));
  }

  // === ARTICLE SCHEMA ===
  const schemas = doc.querySelectorAll('script[type="application/ld+json"]');
  let hasArticleSchema = false;
  schemas.forEach(s => {
    try {
      const parsed = JSON.parse(s.textContent);
      if (parsed['@type'] === 'Article' || parsed['@type'] === 'BlogPosting' || parsed['@type'] === 'NewsArticle') {
        hasArticleSchema = true;
        data.articleSchema = parsed;

        if (!parsed.author) {
          issues.push(createIssue('SHOPIFY_BLOG_NO_AUTHOR_SCHEMA', Category.SHOPIFY, Severity.INFO,
            'Article schema missing author',
            'Author information helps establish E-E-A-T (Experience, Expertise, Authoritativeness, Trust).',
            'Add author name and URL to your Article structured data.'));
        }
        if (!parsed.datePublished) {
          issues.push(createIssue('SHOPIFY_BLOG_NO_DATE_SCHEMA', Category.SHOPIFY, Severity.INFO,
            'Article schema missing datePublished',
            'Publication date helps search engines understand content freshness.',
            'Include datePublished in your Article schema.'));
        }
      }
    } catch {}
  });

  if (!hasArticleSchema) {
    issues.push(createIssue('SHOPIFY_BLOG_NO_SCHEMA', Category.SHOPIFY, Severity.WARNING,
      'No Article/BlogPosting schema found',
      'Article schema can enable rich results like headline, image, and date in search results.',
      'Add BlogPosting or Article JSON-LD schema to your blog post template.'));
  }

  // === FEATURED IMAGE ===
  const featuredImg = doc.querySelector('.article__featured-image img, .blog-post__featured-image img, article img:first-of-type');
  data.hasFeaturedImage = !!featuredImg;

  if (!featuredImg) {
    issues.push(createIssue('SHOPIFY_BLOG_NO_IMAGE', Category.SHOPIFY, Severity.INFO,
      'No featured image detected',
      'Blog posts with images get more social shares and engagement.',
      'Add a high-quality featured image to every blog post.'));
  }

  // === AUTHOR INFO ===
  const authorEl = doc.querySelector('.article__author, .blog-post__author, [data-author], .author');
  data.hasAuthor = !!authorEl;

  if (!authorEl) {
    issues.push(createIssue('SHOPIFY_BLOG_NO_AUTHOR', Category.SHOPIFY, Severity.INFO,
      'No visible author information',
      'Author bylines build trust and support E-E-A-T signals.',
      'Display the author name and consider linking to an author bio page.'));
  }

  // === INTERNAL LINKS IN CONTENT ===
  if (articleEl) {
    const links = articleEl.querySelectorAll('a[href]');
    const internalLinks = Array.from(links).filter(a => {
      const href = a.getAttribute('href') || '';
      return href.startsWith('/') || href.includes(window.location.hostname);
    });
    data.internalLinksInContent = internalLinks.length;

    if (internalLinks.length === 0) {
      issues.push(createIssue('SHOPIFY_BLOG_NO_INTERNAL_LINKS', Category.SHOPIFY, Severity.WARNING,
        'No internal links in blog content',
        'Internal links from blog posts to products and other pages pass SEO value and help discovery.',
        'Add 2-5 internal links to relevant products, collections, or other blog posts.'));
    }
  }

  return { issues, data };
}
