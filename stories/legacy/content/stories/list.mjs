#!/usr/bin/env node
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, query, orderBy, getDocs } from "firebase/firestore";

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
  const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  const db = getFirestore(app);
  const storiesRef = collection(db, "stories");
  const q = query(storiesRef, orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);

  const rows = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      title: data.title,
      isPrebuilt: data.isPrebuilt,
      createdAt: data.createdAt,
    };
  });

  console.table(rows.map((row) => ({
    id: row.id,
    title: row.title,
    isPrebuilt: row.isPrebuilt,
    createdAt: row.createdAt?.seconds ?? null,
  })));
};

main().catch((error) => {
  console.error("listStories failed:", error.message);
  process.exit(1);
});
