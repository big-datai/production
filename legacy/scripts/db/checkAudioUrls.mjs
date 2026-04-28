#!/usr/bin/env node
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
  appId: "1:344436509435:web:3e8ab72dc3cbed3c21d1ea"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'google-gemini-firestore');

console.log('\n🔍 Checking audio URLs in stories...\n');

const storiesRef = collection(db, 'stories');
const snapshot = await getDocs(storiesRef);

let count = 0;
snapshot.forEach((doc) => {
  const data = doc.data();
  if (data.audioUrl) {
    count++;
    console.log(`📖 ${data.title}`);
    console.log(`   Audio URL: ${data.audioUrl}`);
    
    // Check if it's raw or standard format
    if (data.audioUrl.includes('.raw')) {
      console.log(`   Format: RAW PCM`);
    } else if (data.audioUrl.includes('.mp3') || data.audioUrl.includes('.wav')) {
      console.log(`   Format: Standard (MP3/WAV)`);
    } else {
      console.log(`   Format: Unknown`);
    }
    console.log('');
  }
  
  if (count >= 3) return; // Just show first 3
});

console.log(`✅ Checked ${count} stories with audio URLs\n`);
