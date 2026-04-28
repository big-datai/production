/**
 * Shared utilities for handling story pages in ALL formats:
 *
 * Format 1 (new structured): {page: 1, segments: [{speaker: "Narrator", text: "..."}]}
 * Format 2 (flat segments):  [{speaker: "Narrator", text: "..."}]
 * Format 3 (legacy flat):    "page text here as a single string"
 */

/** Get segments from any page format → [{speaker, text}] */
export function pageToSegments(page) {
  // Format 1: {page, segments}
  if (page?.segments && Array.isArray(page.segments)) {
    return page.segments;
  }
  // Format 2: [{speaker, text}] array
  if (Array.isArray(page)) {
    return page.map(seg => ({
      speaker: seg.speaker || Object.keys(seg)[0] || 'Narrator',
      text: seg.text !== undefined ? seg.text : (Object.values(seg)[0] || ''),
    }));
  }
  // Format 3: flat string
  const text = typeof page === 'string' ? page : (page?.text || '');
  return [{ speaker: 'Narrator', text }];
}

/** Extract flat text from a page (works with all formats) */
export function pageToText(page) {
  return pageToSegments(page).map(s => s.text).join(' ');
}

/** Get word count for a page */
export function pageWordCount(page) {
  return pageToText(page).split(/\s+/).length;
}

/** Get total word count for all pages */
export function totalWordCount(pages) {
  return pages.reduce((sum, p) => sum + pageWordCount(p), 0);
}

/** Join all pages into one flat text string */
export function pagesToFullText(pages) {
  return pages.map(pageToText).join(' ');
}
