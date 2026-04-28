import { GoogleGenAI, Modality } from "@google/genai";
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
if (!apiKey) {
  console.error("❌ GEMINI_API_KEY environment variable not set.");
  console.error("Please set it by running:");
  console.error("  export GEMINI_API_KEY='your-api-key-here'");
  console.error("Or add it to your .env.local file");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

// Initialize Firebase Admin
const firebaseProjectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0430249113';
const storageBucket = process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || 'goreading-gemini-object';
const firestoreDatabaseId = process.env.VITE_FIRESTORE_DATABASE_ID || process.env.FIRESTORE_DATABASE_ID || 'google-gemini-firestore';

console.log('🔧 Firebase Configuration:');
console.log(`  Project: ${firebaseProjectId}`);
console.log(`  Storage: ${storageBucket}`);
console.log(`  Database: ${firestoreDatabaseId}\n`);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: firebaseProjectId,
    storageBucket: storageBucket
  });
}

const db = admin.firestore();
db.settings({ databaseId: firestoreDatabaseId });

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const generateImage = async (prompt, model = 'gemini-2.5-flash-image') => {
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        responseModalities: [Modality.IMAGE],
      },
    });
    
    const part = response.candidates?.[0]?.content?.parts?.[0];
    if (part?.inlineData?.data) {
      return part.inlineData.data;
    }
    
    throw new Error("No image was generated from the response.");
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
};

const saveImage = (base64Data, filePath) => {
  const buffer = Buffer.from(base64Data, 'base64');
  fs.writeFileSync(filePath, buffer);
};

const sanitizeFilename = (title) => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
};

const main = async () => {
  const publicDir = path.join(__dirname, '..', 'public');
  const puzzlesDir = path.join(publicDir, 'puzzles');
  const coloringDir = path.join(publicDir, 'coloring');
  
  // Create directories
  if (!fs.existsSync(puzzlesDir)) {
    fs.mkdirSync(puzzlesDir, { recursive: true });
  }
  if (!fs.existsSync(coloringDir)) {
    fs.mkdirSync(coloringDir, { recursive: true });
  }
  
  console.log('🎨 Fetching stories from Firestore...\n');
  
  // Fetch all stories (up to 20) - prioritize prebuilt, then any stories
  let storiesSnapshot = await db.collection('stories')
    .where('isPrebuilt', '==', true)
    .limit(20)
    .get();
  
  // If no prebuilt stories, fetch any stories
  if (storiesSnapshot.empty) {
    console.log('ℹ️  No prebuilt stories found, fetching all available stories...\n');
    storiesSnapshot = await db.collection('stories')
      .limit(20)
      .get();
  }
  
  if (storiesSnapshot.empty) {
    console.error('❌ No stories found in Firestore.');
    console.error('Make sure you have stories in your database.');
    process.exit(1);
  }
  
  const stories = [];
  storiesSnapshot.forEach(doc => {
    const data = doc.data();
    stories.push({
      id: doc.id,
      title: data.title,
      pages: data.pages || []
    });
  });
  
  console.log(`✅ Found ${stories.length} stories\n`);
  console.log('Stories:');
  stories.forEach((story, idx) => {
    console.log(`  ${idx + 1}. ${story.title}`);
  });
  
  console.log('\n🎨 Starting game asset generation...\n');
  console.log('This will create Disney-style illustrations matching your story books!\n');
  
  // Generate puzzle images (vibrant, detailed scenes)
  console.log('🧩 Generating PUZZLE images (detailed, colorful scenes)...\n');
  for (let i = 0; i < stories.length; i++) {
    const story = stories[i];
    const filename = sanitizeFilename(story.title);
    const filePath = path.join(puzzlesDir, `${filename}.png`);
    
    if (fs.existsSync(filePath)) {
      console.log(`  ✓ "${story.title}" already exists, skipping`);
      continue;
    }
    
    try {
      console.log(`  ⏳ [${i + 1}/${stories.length}] Generating puzzle for "${story.title}"...`);
      
      // Create a detailed scene prompt from the story
      const storyText = story.pages.slice(0, 3).map(p => p.text).join(' ');
      const prompt = `A vibrant, colorful Disney-style cartoon illustration for a children's storybook titled "${story.title}". The scene should capture the magical essence of this story: ${storyText.substring(0, 300)}. Style: Classic 2D Disney animation with bright colors, friendly characters, and enchanting details. Perfect for ages 4-8. The image should be detailed and engaging like a storybook illustration. Square format (1:1 aspect ratio). Do NOT include any text or words in the image.`;
      
      const base64Image = await generateImage(prompt);
      saveImage(base64Image, filePath);
      console.log(`  ✅ Saved puzzle: ${filename}.png`);
      
      // Wait 2 seconds between requests to avoid rate limits
      if (i < stories.length - 1) {
        await delay(2000);
      }
    } catch (error) {
      console.error(`  ❌ Failed to generate puzzle for "${story.title}":`, error.message);
    }
  }
  
  // Generate coloring pages (simple line art)
  console.log('\n🎨 Generating COLORING pages (simple line art for kids)...\n');
  for (let i = 0; i < stories.length; i++) {
    const story = stories[i];
    const filename = sanitizeFilename(story.title);
    const filePath = path.join(coloringDir, `${filename}.png`);
    
    if (fs.existsSync(filePath)) {
      console.log(`  ✓ "${story.title}" already exists, skipping`);
      continue;
    }
    
    try {
      console.log(`  ⏳ [${i + 1}/${stories.length}] Generating coloring page for "${story.title}"...`);
      
      // Create a simple character/scene prompt from the story
      const storyText = story.pages.slice(0, 2).map(p => p.text).join(' ');
      const prompt = `A simple, bold black line art drawing suitable for children ages 4-8 to color, based on the story "${story.title}". ${storyText.substring(0, 200)}. Style: Clean black outlines, no shading, no gradients, white background. Simple and friendly like a children's coloring book page. The lines should be thick enough for small hands to color inside. Focus on the main character or central element from the story. Perfect for tap-to-fill digital coloring.`;
      
      const base64Image = await generateImage(prompt);
      saveImage(base64Image, filePath);
      console.log(`  ✅ Saved coloring page: ${filename}.png`);
      
      // Wait 2 seconds between requests to avoid rate limits
      if (i < stories.length - 1) {
        await delay(2000);
      }
    } catch (error) {
      console.error(`  ❌ Failed to generate coloring page for "${story.title}":`, error.message);
    }
  }
  
  // Generate metadata file for the game components
  const metadata = {
    generatedAt: new Date().toISOString(),
    totalStories: stories.length,
    puzzles: stories.map(s => ({
      id: sanitizeFilename(s.title),
      title: s.title,
      imagePath: `/puzzles/${sanitizeFilename(s.title)}.png`,
      pieces: 24, // Default piece count
      difficulty: 'easy'
    })),
    coloringPages: stories.map(s => ({
      id: sanitizeFilename(s.title),
      title: s.title,
      imagePath: `/coloring/${sanitizeFilename(s.title)}.png`,
      category: 'Stories'
    }))
  };
  
  const metadataPath = path.join(publicDir, 'game-assets-metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  
  console.log('\n✨ Asset generation complete!');
  console.log(`📁 Puzzles saved to: ${puzzlesDir}`);
  console.log(`📁 Coloring pages saved to: ${coloringDir}`);
  console.log(`📄 Metadata saved to: ${metadataPath}`);
  console.log(`\n🎮 Generated ${stories.length} puzzles and ${stories.length} coloring pages from your stories!`);
};

main().catch(error => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});
