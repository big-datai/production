import fs from 'node:fs';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

const VIDEO_ID = 'AohVDHtq7SI';
const ROOT = '/Volumes/Samsung500/goreadling';
const cred = JSON.parse(fs.readFileSync(`${ROOT}/credentials-saraandeva.json`, 'utf8'));
const tok  = JSON.parse(fs.readFileSync(`${ROOT}/token-saraandeva.json`, 'utf8'));
const k = cred.installed || cred.web;
const oauth = new OAuth2Client(k.client_id, k.client_secret, k.redirect_uris[0]);
oauth.setCredentials(tok);

const youtube = google.youtube({ version: 'v3', auth: oauth });

const title = 'Sara and Eva 🥞 The Puppies Want Pancakes! | Episode 1';
const description = `🥞 Papa worked late again on the goreadling reading app he's building for Sara — so Mama is making his favorite welcome-back breakfast: PANCAKES! Sara, Eva, Ginger, and Joe are about to make this morning a little chaotic.

This is Episode 1 of Sara and Eva — a 3D animated family show about two real-life sisters, their two real-life dogs, and the real-life children's reading app their Papa is building (goreadling.com — Sara is the world's first user!). New episodes every week!

⏱️ EPISODE CHAPTERS
0:00  Welcome to our house!
0:03  Meet Sara
0:08  Meet Eva
0:13  Meet Mama
0:19  Wake up, sleepyheads!
0:33  Race down to the kitchen
0:43  Mama at the stove
0:57  Hungry sisters say hello
1:11  Papa joins the party
1:25  Counting pancakes 1-2-3-4-5 ✋
1:34  Family table — Joe spins!
1:48  One last pancake hug
1:53  Time to pack lunchboxes
1:58  Off to school 🚌🚗

👍 If you like Sara and Eva, please SUBSCRIBE and ring the 🔔 — new family adventures every week!

🐾 More episodes coming soon:
• Sara and Eva Lose the Puppies
• Eva's First Snow
• Doctor Sara and Patient Joe

This video is made for kids 2-7 — bright, gentle, no scary moments. Filmed for kids by a real family.

🌐 More free bedtime stories: https://goreadling.com/stories
📱 Get the goreadling app: https://apps.apple.com/app/goreadling/id6755505679

#SaraAndEva #KidsCartoon #CartoonsForKids #PreschoolLearning #PuppyStories #goreadling`;

const tags = [
  'sara and eva', 'kids cartoon', 'cartoons for kids', 'kids stories',
  'family cartoon', 'preschool', 'pancake', 'breakfast cartoon',
  'puppy cartoon', 'jack russell', 'pomeranian', 'morning routine',
  'school bus', 'counting cartoon', 'kids learning', 'sisters cartoon',
  'kids dialogue', 'made for kids', 'family vlog cartoon', '3d animated',
  'animated kids show', 'family animation', 'kids show', 'toddler cartoon',
];

console.log(`📝 Updating metadata for video ${VIDEO_ID}...`);
const res = await youtube.videos.update({
  part: ['snippet'],
  requestBody: {
    id: VIDEO_ID,
    snippet: {
      title,
      description,
      tags,
      categoryId: '24', // Entertainment
      defaultLanguage: 'en',
    },
  },
});

console.log('✅ Updated.');
console.log('   Title:', res.data.snippet.title);
console.log('   Tags count:', res.data.snippet.tags?.length);
console.log('   Watch:', `https://youtu.be/${VIDEO_ID}`);
console.log('   Edit:', `https://studio.youtube.com/video/${VIDEO_ID}/edit`);
