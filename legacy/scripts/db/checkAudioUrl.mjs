import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'gen-lang-client-0430249113',
    storageBucket: 'goreading-gemini-object'
  });
}

const db = admin.firestore();
db.settings({ databaseId: 'google-gemini-firestore' });

const storyId = 'Jq7QXLqcqDkteSQLLfuJ';
const doc = await db.collection('stories').doc(storyId).get();
const story = doc.data();

console.log('Story:', story.title);
console.log('\nPage 0 audio URL:', story.pages[0].audioUrl);
console.log('\nChecking if audio file exists in GCS...');

const bucket = admin.storage().bucket();
// Extract path from URL
const audioPath = story.pages[0].audioUrl.split('goreading-gemini-object/')[1];
console.log('Audio path:', audioPath);

const file = bucket.file(audioPath);
const [exists] = await file.exists();
console.log('File exists:', exists);

if (exists) {
  const [metadata] = await file.getMetadata();
  console.log('\nMetadata:');
  console.log('- Content Type:', metadata.contentType);
  console.log('- Size:', metadata.size, 'bytes');
}

process.exit(0);
