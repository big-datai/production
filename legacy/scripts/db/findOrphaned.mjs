#!/usr/bin/env node
/**
 * Find story IDs that have GCS assets (illustrations/audio) but no Firestore document.
 * These are the stories that were accidentally deleted.
 */
import admin from 'firebase-admin';
import fs from 'node:fs';

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "gen-lang-client-0430249113",
});
const db = admin.firestore();
db.settings({ databaseId: "google-gemini-firestore" });
const bucket = admin.storage().bucket("goreading-gemini-object");

(async () => {
  try {
    console.log("Listing cover illustrations...");
    const [illustFiles] = await bucket.getFiles({ prefix: "illustrations/", delimiter: "/" });
    const coverIds = new Set();
    illustFiles.forEach((f) => {
      const match = f.name.match(/^illustrations\/([^/]+)\.jpg$/);
      if (match) coverIds.add(match[1]);
    });
    console.log("Total story IDs with cover illustrations in GCS:", coverIds.size);

    console.log("Listing audio files...");
    // Use delimiter to get just the top-level directories under audio/
    const [, , audioApiResp] = await bucket.getFiles({ prefix: "audio/", delimiter: "/" });
    const audioIds = new Set();
    if (audioApiResp && audioApiResp.prefixes) {
      audioApiResp.prefixes.forEach(p => {
        const match = p.match(/^audio\/([^/]+)\/$/);
        if (match) audioIds.add(match[1]);
      });
    }
    console.log("Total story IDs with audio in GCS:", audioIds.size);

    // Combine all known IDs
    const allIds = new Set([...coverIds, ...audioIds]);
    console.log("\nTotal unique story IDs in GCS:", allIds.size);

    // Get all existing story IDs from Firestore
    console.log("Fetching all story IDs from Firestore...");
    const storiesSnap = await db.collection("stories").select().get();
    const existingIds = new Set(storiesSnap.docs.map(d => d.id));
    console.log("Total stories in Firestore:", existingIds.size);

    // Find orphaned
    const orphaned = [];
    for (const id of allIds) {
      if (!existingIds.has(id)) {
        orphaned.push({ id, hasCover: coverIds.has(id), hasAudio: audioIds.has(id) });
      }
    }

    console.log("\n=== ORPHANED STORIES (deleted from Firestore, assets remain in GCS) ===");
    console.log("Count:", orphaned.length);
    orphaned.forEach((o) => {
      console.log(`  ${o.id} | cover: ${o.hasCover ? "YES" : "no"} | audio: ${o.hasAudio ? "YES" : "no"}`);
    });

    // Write to file for reference
    fs.writeFileSync("orphaned_stories.json", JSON.stringify(orphaned, null, 2));
    console.log("\nSaved to orphaned_stories.json");
  } catch (err) {
    console.error("FATAL ERROR:", err);
  }
  process.exit(0);
})();
