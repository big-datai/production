#!/usr/bin/env node

/**
 * Generate App Icons from Logo SVG
 * 
 * This script creates app icon PNG files at various sizes for iOS.
 * Run with: node scripts/generate-icons.mjs
 * 
 * Note: Requires canvas package. Install with: npm install canvas --save-dev
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Icon sizes needed for iOS
const SIZES = {
  'AppIcon-1024': 1024,  // App Store
  'AppIcon-512': 512,
  'AppIcon-180': 180,    // iPhone Pro Max
  'AppIcon-167': 167,    // iPad Pro
  'AppIcon-152': 152,    // iPad
  'AppIcon-120': 120,    // iPhone
  'AppIcon-87': 87,      // iPhone @3x
  'AppIcon-80': 80,      // iPad @2x
  'AppIcon-76': 76,      // iPad
  'AppIcon-60': 60,      // iPhone
  'AppIcon-58': 58,      // Settings @2x
  'AppIcon-40': 40,      // Spotlight
  'AppIcon-29': 29,      // Settings
  'AppIcon-20': 20,      // Notification
};

// Output directory
const OUTPUT_DIR = path.join(__dirname, '../ios/App/App/Assets.xcassets/AppIcon.appiconset');

async function drawIcon(ctx, size) {
  const scale = size / 512;
  ctx.save();
  ctx.scale(scale, scale);
  
  // Background gradient (purple to blue)
  const gradient = ctx.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, '#8B5CF6');
  gradient.addColorStop(1, '#3B82F6');
  
  // Rounded rectangle background
  const cornerRadius = 96;
  ctx.beginPath();
  ctx.moveTo(16 + cornerRadius, 16);
  ctx.lineTo(496 - cornerRadius, 16);
  ctx.arcTo(496, 16, 496, 16 + cornerRadius, cornerRadius);
  ctx.lineTo(496, 496 - cornerRadius);
  ctx.arcTo(496, 496, 496 - cornerRadius, 496, cornerRadius);
  ctx.lineTo(16 + cornerRadius, 496);
  ctx.arcTo(16, 496, 16, 496 - cornerRadius, cornerRadius);
  ctx.lineTo(16, 16 + cornerRadius);
  ctx.arcTo(16, 16, 16 + cornerRadius, 16, cornerRadius);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();
  
  // Book pages (white)
  ctx.save();
  ctx.translate(256, 300);
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  
  // Book shape
  ctx.beginPath();
  ctx.moveTo(-140, 40);
  ctx.lineTo(-140, -80);
  ctx.lineTo(-72, -104);
  ctx.lineTo(-4, -80);
  ctx.lineTo(64, -104);
  ctx.lineTo(132, -80);
  ctx.lineTo(132, 40);
  ctx.bezierCurveTo(68, 12, -68, 12, -140, 40);
  ctx.closePath();
  ctx.fill();
  
  // Book spine (light gray)
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#F9FAFB';
  ctx.beginPath();
  ctx.moveTo(-72, -104);
  ctx.lineTo(-4, -80);
  ctx.lineTo(64, -104);
  ctx.lineTo(64, 40);
  ctx.bezierCurveTo(16, 20, -16, 20, -72, 40);
  ctx.closePath();
  ctx.fill();
  
  ctx.restore();
  
  // Decorative elements
  ctx.save();
  ctx.translate(256, 180);
  
  // Pink circle
  ctx.fillStyle = '#EC4899';
  ctx.beginPath();
  ctx.arc(-70, -10, 14, 0, Math.PI * 2);
  ctx.fill();
  
  // Yellow star
  ctx.fillStyle = '#FACC15';
  ctx.beginPath();
  const starX = 50, starY = -40;
  for (let i = 0; i < 5; i++) {
    const angle = (i * 4 * Math.PI / 5) - Math.PI / 2;
    const r = i % 2 === 0 ? 16 : 8;
    const x = starX + r * Math.cos(angle);
    const y = starY + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  
  // Letter A (green)
  ctx.fillStyle = '#34D399';
  ctx.font = 'bold 42px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('A', -30, 10);
  
  ctx.restore();
  ctx.restore();
}

async function generateIcons() {
  try {
    // Try to import canvas, but gracefully handle if not installed
    let canvas;
    try {
      const canvasModule = await import('canvas');
      canvas = canvasModule.default || canvasModule;
    } catch (e) {
      console.log('ℹ️  Canvas package not installed.');
      console.log('📝 To generate icons automatically, run:');
      console.log('   npm install canvas --save-dev');
      console.log('');
      console.log('🌐 Or use the browser-based generator:');
      console.log('   Open content/assets/generateAppIcon.html in your browser');
      console.log('   Download each size and place in:', OUTPUT_DIR);
      return;
    }

    console.log('🎨 Generating app icons...\n');

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    for (const [name, size] of Object.entries(SIZES)) {
      const canvasObj = canvas.createCanvas(size, size);
      const ctx = canvasObj.getContext('2d');
      
      drawIcon(ctx, size);
      
      const buffer = canvasObj.toBuffer('image/png');
      const filename = `${name}.png`;
      const filepath = path.join(OUTPUT_DIR, filename);
      
      fs.writeFileSync(filepath, buffer);
      console.log(`✓ Generated ${filename} (${size}x${size})`);
    }

    // Update Contents.json
    const contentsJson = {
      images: [
        {
          filename: 'AppIcon-1024.png',
          idiom: 'universal',
          platform: 'ios',
          size: '1024x1024'
        }
      ],
      info: {
        author: 'xcode',
        version: 1
      }
    };

    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'Contents.json'),
      JSON.stringify(contentsJson, null, 2)
    );

    console.log('\n✅ All icons generated successfully!');
    console.log('📁 Location:', OUTPUT_DIR);
    console.log('\n🔄 Next steps:');
    console.log('   1. Run: npx cap sync ios');
    console.log('   2. Open Xcode and rebuild');
    
  } catch (error) {
    console.error('❌ Error generating icons:', error);
    console.log('\n💡 Alternative: Use the browser-based generator');
    console.log('   Open content/assets/generateAppIcon.html in your browser');
  }
}

generateIcons();
