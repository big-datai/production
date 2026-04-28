import { GoogleGenAI, Modality } from "@google/genai";
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

// Puzzle themes
const PUZZLES = [
  { id: 'solar-system', name: 'The Solar System', emoji: '🌌', prompt: 'A colorful cartoon illustration of the solar system showing all planets orbiting around the sun, with stars in the background. Child-friendly, vibrant colors, educational style.' },
  { id: 'under-the-sea', name: 'Under the Sea', emoji: '🐠', prompt: 'A vibrant underwater ocean scene with colorful fish, coral reefs, sea turtles, dolphins, and sunlight filtering through the water. Cartoon style, bright colors.' },
  { id: 'jungle-party', name: 'Jungle Party', emoji: '🦁', prompt: 'A playful jungle scene with friendly cartoon animals (lion, monkey, elephant, parrot, zebra) having a party with balloons and decorations among tropical trees and flowers.' },
  { id: 'dinosaur-valley', name: 'Dinosaur Valley', emoji: '🦕', prompt: 'A prehistoric landscape with friendly cartoon dinosaurs (T-Rex, Brachiosaurus, Triceratops, Pterodactyl) in a valley with palm trees, volcanoes, and a river.' },
  { id: 'magic-castle', name: 'Magic Castle', emoji: '🏰', prompt: 'A magical fairy tale castle with colorful towers, flags, a rainbow, sparkles, and a friendly dragon flying nearby. Whimsical cartoon style.' },
  { id: 'construction-site', name: 'Construction Site', emoji: '🚜', prompt: 'A busy construction site with cartoon trucks (dump truck, crane, excavator, cement mixer), workers with hard hats, and a building under construction. Bright colors.' },
  { id: 'fairy-garden', name: 'Fairy Garden', emoji: '🧚', prompt: 'An enchanted garden with friendly fairies, colorful flowers, mushrooms, butterflies, dragonflies, and sparkles. Magical, whimsical cartoon style.' },
  { id: 'rainy-day', name: 'Rainy Day', emoji: '🌧️', prompt: 'A cozy rainy day scene with children in raincoats and boots splashing in puddles, umbrellas, rain drops, rainbow, and happy animals. Cheerful cartoon style.' },
  { id: 'space-station', name: 'Space Station', emoji: '🚀', prompt: 'A futuristic space station orbiting Earth with astronauts, rockets, satellites, stars, and planets visible. Colorful, child-friendly cartoon style.' },
  { id: 'farmyard', name: 'Farmyard Fun', emoji: '🐄', prompt: 'A cheerful farm scene with a red barn, friendly farm animals (cow, pig, chicken, horse, sheep), tractor, and fields. Bright, colorful cartoon style.' }
];

// Coloring page themes
const COLORING_PAGES = [
  // Animals
  { id: 'lion', name: 'Lion', category: 'Animals', prompt: 'A simple, bold line art drawing of a friendly cartoon lion with a big mane, suitable for coloring. Clean black outlines, no shading, white background.' },
  { id: 'elephant', name: 'Elephant', category: 'Animals', prompt: 'A simple, bold line art drawing of a cute cartoon elephant with big ears and a long trunk, suitable for coloring. Clean black outlines, no shading, white background.' },
  { id: 'butterfly', name: 'Butterfly', category: 'Animals', prompt: 'A simple, bold line art drawing of a beautiful butterfly with decorative wing patterns, suitable for coloring. Clean black outlines, no shading, white background.' },
  { id: 'bunny', name: 'Bunny', category: 'Animals', prompt: 'A simple, bold line art drawing of an adorable bunny rabbit with long ears, suitable for coloring. Clean black outlines, no shading, white background.' },
  
  // Food
  { id: 'cupcake', name: 'Cupcake', category: 'Food', prompt: 'A simple, bold line art drawing of a cute cupcake with frosting swirls and a cherry on top, suitable for coloring. Clean black outlines, no shading, white background.' },
  { id: 'ice-cream', name: 'Ice Cream', category: 'Food', prompt: 'A simple, bold line art drawing of an ice cream cone with multiple scoops and toppings, suitable for coloring. Clean black outlines, no shading, white background.' },
  { id: 'pizza', name: 'Pizza', category: 'Food', prompt: 'A simple, bold line art drawing of a pizza slice with toppings (pepperoni, mushrooms, etc.), suitable for coloring. Clean black outlines, no shading, white background.' },
  { id: 'donut', name: 'Donut', category: 'Food', prompt: 'A simple, bold line art drawing of a donut with icing and sprinkles, suitable for coloring. Clean black outlines, no shading, white background.' },
  
  // Vehicles
  { id: 'rocket', name: 'Rocket', category: 'Vehicles', prompt: 'A simple, bold line art drawing of a cartoon rocket ship with flames, suitable for coloring. Clean black outlines, no shading, white background.' },
  { id: 'car', name: 'Race Car', category: 'Vehicles', prompt: 'A simple, bold line art drawing of a cool race car with racing stripes and big wheels, suitable for coloring. Clean black outlines, no shading, white background.' },
  { id: 'airplane', name: 'Airplane', category: 'Vehicles', prompt: 'A simple, bold line art drawing of a friendly airplane with windows and clouds, suitable for coloring. Clean black outlines, no shading, white background.' },
  { id: 'train', name: 'Train', category: 'Vehicles', prompt: 'A simple, bold line art drawing of a cartoon train engine with smoke coming from the chimney, suitable for coloring. Clean black outlines, no shading, white background.' },
  
  // Fantasy
  { id: 'unicorn', name: 'Unicorn', category: 'Fantasy', prompt: 'A simple, bold line art drawing of a magical unicorn with a horn and flowing mane, suitable for coloring. Clean black outlines, no shading, white background.' },
  { id: 'mermaid', name: 'Mermaid', category: 'Fantasy', prompt: 'A simple, bold line art drawing of a cute mermaid with a fish tail and long hair, suitable for coloring. Clean black outlines, no shading, white background.' },
  { id: 'dragon', name: 'Dragon', category: 'Fantasy', prompt: 'A simple, bold line art drawing of a friendly dragon with wings and scales, suitable for coloring. Clean black outlines, no shading, white background.' },
  { id: 'fairy', name: 'Fairy', category: 'Fantasy', prompt: 'A simple, bold line art drawing of a cute fairy with wings and a wand, suitable for coloring. Clean black outlines, no shading, white background.' },
  
  // Nature
  { id: 'flower', name: 'Flower', category: 'Nature', prompt: 'A simple, bold line art drawing of a beautiful flower with petals and leaves, suitable for coloring. Clean black outlines, no shading, white background.' },
  { id: 'tree', name: 'Tree', category: 'Nature', prompt: 'A simple, bold line art drawing of a large tree with branches, leaves, and roots, suitable for coloring. Clean black outlines, no shading, white background.' },
  { id: 'sun', name: 'Happy Sun', category: 'Nature', prompt: 'A simple, bold line art drawing of a smiling sun with rays and a friendly face, suitable for coloring. Clean black outlines, no shading, white background.' },
  { id: 'rainbow', name: 'Rainbow', category: 'Nature', prompt: 'A simple, bold line art drawing of a rainbow with clouds on each end, suitable for coloring. Clean black outlines, no shading, white background.' }
];

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
  
  console.log('🎨 Starting game asset generation...\n');
  
  // Generate puzzle images
  console.log('🧩 Generating puzzle images...');
  for (const puzzle of PUZZLES) {
    const filePath = path.join(puzzlesDir, `${puzzle.id}.png`);
    
    if (fs.existsSync(filePath)) {
      console.log(`  ✓ ${puzzle.name} already exists, skipping`);
      continue;
    }
    
    try {
      console.log(`  ⏳ Generating ${puzzle.name}...`);
      const base64Image = await generateImage(puzzle.prompt);
      saveImage(base64Image, filePath);
      console.log(`  ✅ Saved ${puzzle.name}`);
      
      // Wait 2 seconds between requests to avoid rate limits
      await delay(2000);
    } catch (error) {
      console.error(`  ❌ Failed to generate ${puzzle.name}:`, error.message);
    }
  }
  
  console.log('\n🎨 Generating coloring pages...');
  for (const page of COLORING_PAGES) {
    const filePath = path.join(coloringDir, `${page.id}.png`);
    
    if (fs.existsSync(filePath)) {
      console.log(`  ✓ ${page.name} already exists, skipping`);
      continue;
    }
    
    try {
      console.log(`  ⏳ Generating ${page.name}...`);
      const base64Image = await generateImage(page.prompt);
      saveImage(base64Image, filePath);
      console.log(`  ✅ Saved ${page.name}`);
      
      // Wait 2 seconds between requests to avoid rate limits
      await delay(2000);
    } catch (error) {
      console.error(`  ❌ Failed to generate ${page.name}:`, error.message);
    }
  }
  
  console.log('\n✨ Asset generation complete!');
  console.log(`📁 Puzzles saved to: ${puzzlesDir}`);
  console.log(`📁 Coloring pages saved to: ${coloringDir}`);
};

main().catch(console.error);
