import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
}
const db = admin.firestore();
db.settings({ databaseId: 'google-gemini-firestore' });

async function checkLevel(level) {
  const snap = await db.collection('stories').where('readingLevel', '==', level).get();
  console.log(`\n=== Level ${level}: ${snap.size} stories ===`);
  snap.forEach(doc => {
    const d = doc.data();
    const pages = d.pages || [];
    const pagesWithImg = pages.filter(p => p.illustrationUrl).length;
    const pagesWithAudio = pages.filter(p => p.audioUrl).length;
    const pagesWithText = pages.filter(p => p.text && p.text.trim()).length;
    const pagesWithTimings = pages.filter(p => p.timings && p.timings.length).length;
    const hasIllustration = !!d.illustrationUrl;
    console.log(`  "${d.title}" (${doc.id})`);
    console.log(`    cover: ${hasIllustration ? '✅' : '❌'}  pages: ${pages.length}  text: ${pagesWithText}  img: ${pagesWithImg}  audio: ${pagesWithAudio}  timings: ${pagesWithTimings}`);
    if (pages.length > 0 && pagesWithImg < pages.length) {
      pages.forEach((p, i) => {
        if (!p.illustrationUrl) console.log(`    ⚠️ Page ${i+1} missing image`);
        if (!p.text || !p.text.trim()) console.log(`    ⚠️ Page ${i+1} missing text`);
        if (!p.audioUrl) console.log(`    ⚠️ Page ${i+1} missing audio`);
      });
    }
  });
}

(async () => {
  await checkLevel('A');
  await checkLevel('B');
  await checkLevel('C');
  process.exit(0);
})();
