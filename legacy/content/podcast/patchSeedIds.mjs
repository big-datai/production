#!/usr/bin/env node

/**
 * Utility to patch YOUTUBE_IDS or SPOTIFY_IDS in seedBednightStories.mjs.
 *
 * Usage as CLI:
 *   node content/podcast/patchSeedIds.mjs --youtube "Stone Soup" OqT_BOPahs4
 *   node content/podcast/patchSeedIds.mjs --spotify "Stone Soup" 6jt4sFhpRaqyuZMcNcwylC
 *
 * Usage as module:
 *   import { patchYoutubeId, patchSpotifyId } from './patchSeedIds.mjs';
 *   patchYoutubeId('Stone Soup', 'OqT_BOPahs4');
 *   patchSpotifyId('Stone Soup', '6jt4sFhpRaqyuZMcNcwylC');
 */

import fs from "node:fs";
import path from "node:path";

const SEED_FILE = path.resolve(
  new URL(".", import.meta.url).pathname,
  "seedBednightStories.mjs"
);

/**
 * Add or update an entry in a const object block like:
 *   const YOUTUBE_IDS = { ... };
 */
function patchIdBlock(blockName, title, id) {
  let content = fs.readFileSync(SEED_FILE, "utf8");
  const blockRegex = new RegExp(
    `(const ${blockName} = \\{)([\\s\\S]*?)(\\};)`
  );
  const match = content.match(blockRegex);
  if (!match) {
    throw new Error(`Could not find '${blockName}' block in ${SEED_FILE}`);
  }

  const [fullMatch, opener, body, closer] = match;

  // Check if title already exists
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const entryRegex = new RegExp(
    `['"]${escapedTitle}['"]:\\s*'[^']*'`
  );

  let newBody;
  if (entryRegex.test(body)) {
    // Update existing entry
    newBody = body.replace(entryRegex, `'${title}': '${id}'`);
    console.log(`  📝 Updated ${blockName}['${title}'] = '${id}'`);
  } else {
    // Add new entry before the closing brace
    const quote = title.includes("'") ? `"${title}"` : `'${title}'`;
    const newEntry = `  ${quote}: '${id}',\n`;
    newBody = body.trimEnd() + "\n" + newEntry;
    console.log(`  ➕ Added ${blockName}['${title}'] = '${id}'`);
  }

  content = content.replace(fullMatch, opener + newBody + closer);
  fs.writeFileSync(SEED_FILE, content);
}

export function patchYoutubeId(title, id) {
  patchIdBlock("YOUTUBE_IDS", title, id);
}

export function patchSpotifyId(title, id) {
  patchIdBlock("SPOTIFY_IDS", title, id);
}

// CLI usage
if (process.argv[1] && process.argv[1].includes("patchSeedIds")) {
  const args = process.argv.slice(2);
  const isYoutube = args.includes("--youtube");
  const isSpotify = args.includes("--spotify");
  const filtered = args.filter((a) => !a.startsWith("--"));
  const title = filtered[0];
  const id = filtered[1];

  if ((!isYoutube && !isSpotify) || !title || !id) {
    console.error(
      'Usage: node patchSeedIds.mjs --youtube|--spotify "Story Title" ID'
    );
    process.exit(1);
  }

  if (isYoutube) patchYoutubeId(title, id);
  if (isSpotify) patchSpotifyId(title, id);
}
