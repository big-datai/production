import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Current production configuration (migration complete)
const PROJECT_ID = 'gen-lang-client-0430249113';
const STORAGE_BUCKET = 'goreading-gemini-object';
const FIRESTORE_DB = 'google-gemini-firestore';

// Old bucket (project deleted - for reference only)
const OLD_BUCKET = 'studio-2109295913-13220.firebasestorage.app';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: PROJECT_ID,
    storageBucket: STORAGE_BUCKET
  });
}

const db = admin.firestore();
db.settings({ databaseId: FIRESTORE_DB });

async function findOldUrls() {
  console.log('🔍 Searching for documents with old URLs...\n');
  
  const storiesSnapshot = await db.collection('stories').get();
  
  for (const doc of storiesSnapshot.docs) {
    const dataStr = JSON.stringify(doc.data());
    if (dataStr.includes(OLD_BUCKET)) {
      const data = doc.data();
      console.log(`\n📄 Found old URLs in: ${data.title || doc.id}`);
      console.log(`   Document ID: ${doc.id}`);
      
      // Check all fields
      for (const [key, value] of Object.entries(data)) {
        const valueStr = JSON.stringify(value);
        if (valueStr.includes(OLD_BUCKET)) {
          console.log(`   ⚠️  Field '${key}' contains old URL`);
          
          if (typeof value === 'string') {
            console.log(`      ${value.substring(0, 100)}...`);
          } else if (Array.isArray(value)) {
            console.log(`      Array with ${value.length} items`);
            value.forEach((item, idx) => {
              const itemStr = JSON.stringify(item);
              if (itemStr.includes(OLD_BUCKET)) {
                console.log(`      [${idx}]:`, JSON.stringify(item, null, 2).substring(0, 200));
              }
            });
          } else {
            console.log(`      ${JSON.stringify(value, null, 2).substring(0, 200)}`);
          }
        }
      }
    }
  }
}

findOldUrls().then(() => {
  console.log('\n✅ Search complete');
  process.exit(0);
}).catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
