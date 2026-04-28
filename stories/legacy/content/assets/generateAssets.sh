#!/bin/bash

# Script to generate puzzle and coloring game assets from your stories using Gemini AI
# This will create Disney-style illustrations based on your existing storybook library

echo "🎨 Gemini Game Asset Generator (Story Edition)"
echo "=============================================="
echo ""

# Check if GEMINI_API_KEY is set
if [ -z "$GEMINI_API_KEY" ]; then
    echo "❌ GEMINI_API_KEY not found in environment"
    echo ""
    echo "Please run this script with your API key:"
    echo "  GEMINI_API_KEY='your-key-here' bash scripts/generate-assets.sh"
    echo ""
    echo "Or export it first:"
    echo "  export GEMINI_API_KEY='your-key-here'"
    echo "  bash scripts/generate-assets.sh"
    echo ""
    exit 1
fi

echo "✅ API key found"
echo ""
echo "This will generate Disney-style illustrations from your stories:"
echo "  📸 Puzzle images (vibrant, detailed scenes matching your stories)"
echo "  ✏️  Coloring pages (simple line art for kids to color)"
echo ""
echo "The script will:"
echo "  1. Fetch up to 20 prebuilt stories from Firestore"
echo "  2. Generate puzzle images (colorful, detailed)"
echo "  3. Generate coloring pages (black line art)"
echo "  4. Create metadata file for the game components"
echo ""
echo "⏱️  Estimated time: 3-5 minutes (with 2 second delays between requests)"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 1
fi

echo ""
echo "🚀 Starting generation..."
echo ""

# Run the Node.js script
node scripts/generateGameAssetsFromStories.mjs

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo "✨ All done! Your game assets are ready."
    echo ""
    echo "📁 Files created:"
    echo "   • /public/puzzles/ - Puzzle images from your stories"
    echo "   • /public/coloring/ - Coloring pages from your stories"
    echo "   • /public/game-assets-metadata.json - Game configuration"
    echo ""
    echo "🎮 Now you can play Puzzles and Coloring games with your own stories!"
else
    echo ""
    echo "❌ Generation failed. Please check the error messages above."
    exit 1
fi
