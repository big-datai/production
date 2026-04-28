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

const snapshot = await db.collection('stories').get();
const titles = {};

snapshot.docs.forEach(doc => {
  const title = doc.data().title;
  if (titles[title]) {
    titles[title].push(doc.id);
  } else {
    titles[title] = [doc.id];
  }
});

console.log('Duplicate stories:');
let foundDupes = false;
Object.entries(titles).forEach(([title, ids]) => {
  if (ids.length > 1) {
    foundDupes = true;
    console.log(`  ${title}: ${ids.length} copies`);
    ids.forEach(id => console.log(`    - ${id}`));
  }
});

if (!foundDupes) {
  console.log('  No duplicates found!');
}

process.exit(0);
