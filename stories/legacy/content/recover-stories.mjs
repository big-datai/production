#!/usr/bin/env node
// Recover story texts from story.json export files into podcastStoryConstants.js
// Dynamically scans exports/stories/*/text/story.json for any missing stories.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONSTANTS_FILE = path.join(__dirname, 'podcast/podcastStoryConstants.js');
const STORIES_DIR = path.join(ROOT, 'exports', 'stories');

// Read current constants file
let content = fs.readFileSync(CONSTANTS_FILE, 'utf8');

// Extract existing titles to avoid duplicates
const existingTitles = new Set();
const titleRegex = /title:\s*"([^"]+)"/g;
let match;
while ((match = titleRegex.exec(content)) !== null) {
  existingTitles.add(match[1]);
}
console.log(`Found ${existingTitles.size} existing stories in podcastStoryConstants.js`);

// Dynamically scan all story export folders for story.json files
const storyJsonPaths = [];
if (fs.existsSync(STORIES_DIR)) {
  for (const dir of fs.readdirSync(STORIES_DIR)) {
    const jsonPath = path.join(STORIES_DIR, dir, 'text', 'story.json');
    if (fs.existsSync(jsonPath)) {
      storyJsonPaths.push(jsonPath);
    }
  }
}

if (storyJsonPaths.length === 0) {
  console.log('No story.json files found in exports/stories/*/text/');
  process.exit(0);
}

console.log(`Found ${storyJsonPaths.length} story.json files to check`);

// Process each story.json
const newStories = [];
for (const jsonPath of storyJsonPaths) {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const title = data.title;

  if (!title) {
    console.log(`⚠️  No title in: ${jsonPath}`);
    continue;
  }

  if (existingTitles.has(title)) {
    console.log(`⏩ Already exists: ${title}`);
    continue;
  }

  if (!data.pages || data.pages.length === 0) {
    console.log(`⚠️  No pages: ${title}`);
    continue;
  }

  console.log(`✅ Adding: ${title} (${data.pages.length} pages)`);
  newStories.push({ title, pages: data.pages });
}

if (newStories.length === 0) {
  console.log('\nNo new stories to add.');
  process.exit(0);
}

// Build the new story entries as JS source
const storyEntries = newStories.map(story => {
  const escapedTitle = story.title.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const pageStrings = story.pages.map(page => {
    // Pages might be strings or objects with .text
    const text = typeof page === 'string' ? page : page.text || '';
    const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `      "${escaped}"`;
  });

  return `  {\n    title: "${escapedTitle}",\n    pages: [\n${pageStrings.join(',\n\n')}\n    ]\n  }`;
});

// Insert before the final ];
const insertionPoint = content.lastIndexOf('];');
if (insertionPoint === -1) {
  console.error('❌ Could not find closing ]; in constants file');
  process.exit(1);
}

// Add comma after last existing entry, then new entries
const before = content.slice(0, insertionPoint).trimEnd();
const after = content.slice(insertionPoint);

const newContent = before + ',\n\n' + storyEntries.join(',\n\n') + '\n' + after;

fs.writeFileSync(CONSTANTS_FILE, newContent, 'utf8');

// Verify
const verifyContent = fs.readFileSync(CONSTANTS_FILE, 'utf8');
const newCount = (verifyContent.match(/title:\s*"/g) || []).length;
console.log(`\n✅ Done! podcastStoryConstants.js now has ${newCount} stories (was ${existingTitles.size})`);
