#!/usr/bin/env node
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, orderBy } from "firebase/firestore";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const requireEnvValue = (label, ...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  throw new Error(`Missing ${label}. Please set one of: ${keys.join(", ")}`);
};

const firebaseConfig = {
  apiKey: requireEnvValue("Firebase apiKey", "FIREBASE_API_KEY", "VITE_FIREBASE_API_KEY"),
  authDomain: requireEnvValue("Firebase authDomain", "FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: requireEnvValue("Firebase projectId", "FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID"),
  storageBucket: requireEnvValue("Firebase storageBucket", "FIREBASE_STORAGE_BUCKET", "VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: requireEnvValue("Firebase messagingSenderId", "FIREBASE_MESSAGING_SENDER_ID", "VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: requireEnvValue("Firebase appId", "FIREBASE_APP_ID", "VITE_FIREBASE_APP_ID"),
};

const main = async () => {
  try {
    const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    const db = getFirestore(app, 'google-gemini-firestore');
    
    console.log('\n🎫 Support Tickets in Firestore\n');
    console.log('=' .repeat(70));
    
    const ticketsRef = collection(db, "support_tickets");
    const q = query(ticketsRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log('\n❌ No support tickets found in the database.\n');
      return;
    }

    console.log(`\n✅ Found ${snapshot.size} support ticket(s):\n`);

    snapshot.docs.forEach((doc, index) => {
      const data = doc.data();
      console.log(`${index + 1}. ID: ${doc.id}`);
      console.log(`   Type: ${data.type || 'N/A'}`);
      console.log(`   Status: ${data.status || 'N/A'}`);
      console.log(`   Name: ${data.name || 'N/A'}`);
      console.log(`   Email: ${data.email || 'N/A'}`);
      console.log(`   Subject: ${data.subject || 'N/A'}`);
      console.log(`   Message: ${data.message || 'N/A'}`);
      console.log(`   User ID: ${data.userId || 'N/A'}`);
      console.log(`   Created: ${data.createdAt ? new Date(data.createdAt.seconds * 1000).toISOString() : 'N/A'}`);
      console.log(`   Platform: ${data.platform || 'N/A'}`);
      console.log('');
    });

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
};

main();
