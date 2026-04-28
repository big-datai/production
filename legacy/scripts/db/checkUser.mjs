import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const saPath = path.resolve(__dirname, '..', 'service-account.json');

let cred;
if (fs.existsSync(saPath)) {
  cred = admin.credential.cert(saPath);
} else {
  cred = admin.credential.applicationDefault();
}

const app = admin.initializeApp({ credential: cred, projectId: 'gen-lang-client-0430249113' });

const userId = 'device_FBB1DEBE-3D06-425D-BDB9-7945F83E0956';

// Check google-gemini-firestore database
const db = app.firestore();
db.settings({ databaseId: 'google-gemini-firestore' });

const userDoc = await db.collection('users').doc(userId).get();
console.log('google-gemini-firestore - user exists:', userDoc.exists);

if (!userDoc.exists) {
  console.log('Creating user document with isSubscribed: true...');
  await db.collection('users').doc(userId).set({
    isSubscribed: true,
    totalStoriesCreated: 0,
    stars: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log('✅ User document created with subscription active!');
} else {
  console.log('Current data:', JSON.stringify(userDoc.data(), null, 2));
  if (!userDoc.data().isSubscribed) {
    console.log('Setting isSubscribed: true...');
    await db.collection('users').doc(userId).update({ isSubscribed: true });
    console.log('✅ Subscription status updated!');
  }
}

// Verify
const verify = await db.collection('users').doc(userId).get();
console.log('Verified:', JSON.stringify(verify.data(), null, 2));

process.exit(0);
