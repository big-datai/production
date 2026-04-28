#!/usr/bin/env node

/**
 * Generate SPOTIFY_MARKETING.md episode entries for Spotify for Podcasters.
 * Reads MP3 durations and outputs episode titles + descriptions for copy-paste.
 *
 * Usage:
 *   node content/podcast/generateSpotifyMarketing.mjs
 */

import { execSync } from "child_process";
import fs from "node:fs";
import path from "node:path";
import { PODCAST_STORIES } from "./podcastStoryConstants.js";
import { createRequire } from 'module';
// Import YOUTUBE_IDS for per-story YouTube links
const seedPath = path.resolve(process.cwd(), 'content/podcast/seedBednightStories.mjs');
const seedContent = fs.readFileSync(seedPath, 'utf8');
const ytMatch = seedContent.match(/const YOUTUBE_IDS = \{([\s\S]*?)\};/);
const YOUTUBE_IDS = {};
if (ytMatch) {
  // Handle both 'title': 'id' and "title's": 'id' formats
  const entries = ytMatch[1].matchAll(/"([^"]+)":\s*'([^']+)'|'([^']+)':\s*'([^']+)'/g);
  for (const m of entries) YOUTUBE_IDS[m[1] || m[3]] = m[2] || m[4];
}

const STORIES_DIR = "exports/stories";
const LEGACY_MP3_DIR = "exports/spotify";
const OUTPUT_FILE = path.join(STORIES_DIR, "SPOTIFY_MARKETING.md");

const safeTitle = (title) =>
  title.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");

const titleToSlug = (title) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Find story-specific export folder */
function findStoryDir(title) {
  const safe = safeTitle(title);
  // Search both active and _published dirs
  const searchDirs = [STORIES_DIR, path.join(STORIES_DIR, "_published")];
  for (const base of searchDirs) {
    if (!fs.existsSync(base)) continue;
    const matches = fs
      .readdirSync(base)
      .filter(
        (d) =>
          d.startsWith(safe + "_") &&
          fs.statSync(path.join(base, d)).isDirectory()
      )
      .sort()
      .reverse();
    if (matches.length > 0) return path.join(base, matches[0]);
  }
  return null;
}

/** Find MP3 — story folder first, then legacy */
function findMp3(title) {
  const safe = safeTitle(title);
  const storyDir = findStoryDir(title);
  if (storyDir) {
    const mp3 = path.join(storyDir, "spotify", `${safe}.mp3`);
    if (fs.existsSync(mp3)) return mp3;
  }
  const legacy = path.join(LEGACY_MP3_DIR, `${safe}.mp3`);
  if (fs.existsSync(legacy)) return legacy;
  return null;
}

const getAudioDuration = (filePath) =>
  parseFloat(
    execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim()
  );

// ── Story-specific marketing data ──
// Reuse the same data from YouTube marketing where possible.
// Rich Spotify descriptions — longer and more engaging than YouTube (no chapters needed).
// Each desc is the full body paragraph(s) used in the episode description.
const STORY_DATA = {
  "Aladdin and the Wonderful Lamp": {
    emoji: "🪔",
    desc: "A magical journey with a kind-hearted boy who discovers a mysterious lamp hidden deep inside a secret cave. With a powerful genie granting wishes, Aladdin must use courage and cleverness to outsmart a wicked sorcerer who wants the lamp for himself. Along the way, Aladdin learns that true wealth isn't gold or jewels — it's the love of friends and the strength of a kind heart.\n\nThis classic Arabian Nights tale features multi-voice narration with unique character voices, gentle ambient music, and sound effects that bring the story to life. Perfect for bedtime routines, quiet time, or helping little ones drift off to sleep.",
  },
  "Pocahontas, Daughter of the River": {
    emoji: "🌿",
    desc: "Follow a brave and curious young girl who bridges two worlds with kindness and courage. Pocahontas befriends woodland creatures, listens to the wisdom of the wind, and brings peace between her people and newcomers from across the sea. When fear and misunderstanding threaten to tear everyone apart, it's Pocahontas's compassion and bravery that show both sides a better way.\n\nA beautifully narrated tale with multiple character voices, calming nature sounds, and gentle ambient music. Ideal for children who love stories about nature, friendship, and standing up for what's right.",
  },
  "Snow White and the Seven Dwarfs": {
    emoji: "🍎",
    desc: "The beloved tale of a kind princess who finds friendship and shelter with seven lovable dwarfs deep in an enchanted forest. When the wicked queen's jealousy puts Snow White in terrible danger — from a poisoned apple to a magical sleep — only true love and loyal friends can save the day. Each dwarf has their own unique personality and voice, making this audio drama a joy to listen to.\n\nFeaturing multi-voice narration with distinct character voices for each dwarf, the queen, and Snow White herself. Gentle ambient music and a warm, soothing pace make this the perfect bedtime companion.",
  },
  "The Three Little Pigs": {
    emoji: "🐷",
    desc: "Three little pig brothers set out into the wide world to build their very own homes — but a huffing, puffing wolf has other plans! One builds with straw, one with sticks, and one takes the time to build with sturdy bricks. When the big bad wolf comes knocking, only the most careful pig is ready. A classic tale about hard work, perseverance, and the power of planning ahead.\n\nThis lively audio drama features unique voices for each pig and a wonderfully dramatic wolf. With playful sound effects and calming background music, it's an engaging listen that gently winds down into the perfect bedtime mood.",
  },
  "The Gingerbread Man": {
    emoji: "🍪",
    desc: "A freshly baked gingerbread cookie springs to life and dashes out of the kitchen, racing through the countryside and outsmarting everyone he meets — the old woman, the old man, a cow, a horse, and more. 'Run, run, as fast as you can! You can't catch me, I'm the Gingerbread Man!' But when he encounters a very clever fox at the river's edge, the chase takes an unexpected turn. A playful tale about cleverness, overconfidence, and humility.\n\nMulti-voice narration brings every character to life with distinct personalities. Gentle pacing and warm ambient music make this a delightful bedtime story that children ask to hear again and again.",
  },
  "Marina the Little Mermaid": {
    emoji: "🧜‍♀️",
    desc: "A curious young mermaid named Marina dreams of life above the waves. When she rescues a prince during a terrible storm, she falls in love with the world beyond the sea. Marina's journey from the depths of the ocean to the land of humans is a heartwarming tale of courage, sacrifice, friendship, and following your dreams — even when the path is uncertain.\n\nThis enchanting audio drama features multiple character voices, underwater sound effects, and soothing oceanic ambient music. A beautiful story about being true to yourself, perfect for bedtime.",
  },
  "Goldilocks and the Three Bears": {
    emoji: "🐻",
    desc: "A curious golden-haired girl stumbles upon a cozy cottage deep in the woods, belonging to three friendly bears — Papa Bear, Mama Bear, and tiny Baby Bear. She tries their porridge (too hot! too cold! just right!), their chairs, and their beds, discovering that 'just right' is the best feeling of all. When the bears come home, a gentle lesson about respecting others' belongings unfolds.\n\nEach bear has their own delightful voice in this multi-voice audio drama. With warm narration, playful moments, and calming music, this is a timeless story perfect for the youngest listeners at bedtime.",
  },
  "Jack and the Beanstalk": {
    emoji: "🌱",
    desc: "A brave young boy named Jack trades his family's cow for a handful of magic beans — and wakes up to find an enormous beanstalk stretching into the clouds! Jack climbs into a world of giants, golden eggs, and enchanted harps. But the fearsome giant is not happy about a visitor in his castle, and Jack must use all his courage and quick thinking to save the day and help his family.\n\nA thrilling adventure narrated with multiple character voices, dramatic sound effects, and gentle background music that builds excitement while keeping a soothing bedtime pace.",
  },
  "Little Red Riding Hood": {
    emoji: "🧣",
    desc: "A sweet girl in a bright red hood sets off through the forest to visit her beloved grandmother, carrying a basket of goodies. But lurking among the trees is a cunning wolf with a terrible plan. When Little Red Riding Hood arrives at grandmother's cottage, something doesn't seem quite right — 'What big eyes you have!' A timeless tale about listening to good advice, the love between family, and the courage to face your fears.\n\nFeaturing distinct voices for Little Red, the wolf, grandmother, and the brave woodcutter. Gentle narration with atmospheric forest sounds and calming music create the perfect bedtime atmosphere.",
  },
  "Cinderella": {
    emoji: "👠",
    desc: "A kind and gentle girl endures cruelty from her stepmother and stepsisters with grace and an unbreakable spirit. When a fairy godmother appears in a shower of sparkles, Cinderella's evening transforms into pure magic — a pumpkin becomes a golden carriage, mice become horses, and rags become the most beautiful gown in the kingdom. But the clock is ticking toward midnight! Glass slippers, a grand ball, and a prince who searches the entire kingdom make this the ultimate fairy tale.\n\nThis lavish audio drama features multi-voice narration with unique voices for the stepsisters, fairy godmother, prince, and more. Enchanting music and a warm, dreamy pace make it perfect for drifting off to sleep.",
  },
  "The Ugly Duckling": {
    emoji: "🦢",
    desc: "A little duckling who looks different from all the others faces teasing, loneliness, and rejection wherever he goes. Through a long, difficult journey across seasons — from the farm pond to frozen lakes to spring meadows — he discovers that being different is actually the most beautiful thing of all. When he finally sees his reflection and realizes he's become a magnificent swan, it's a moment that melts hearts every time.\n\nA touching Hans Christian Andersen classic about self-acceptance, patience, and inner beauty. Multi-voice narration with gentle ambient music and nature sounds create a calming, emotionally rich listening experience.",
  },
  "Hansel and Gretel": {
    emoji: "🏠",
    desc: "Two brave siblings, Hansel and Gretel, find themselves lost in a deep, dark forest after being abandoned. Hungry and scared, they stumble upon an incredible house made entirely of candy, gingerbread, and frosted sweets. But the kindly old woman who lives inside has a wicked secret — she's a witch who lures children with sweets! Using their wits and courage, the siblings must outsmart the witch and find their way home. A gripping story about sibling love, bravery, and clever thinking.\n\nFeaturing dramatic multi-voice narration, atmospheric forest sounds, and a soothing musical backdrop that balances excitement with bedtime calm.",
  },
  "Rapunzel": {
    emoji: "💇‍♀️",
    desc: "A girl with impossibly long golden hair is locked away in a tall tower deep in the forest by a jealous enchantress. Year after year, Rapunzel knows nothing of the world beyond her window — until a kind prince hears her beautiful singing echoing through the trees. 'Rapunzel, Rapunzel, let down your hair!' An adventure of love, courage, and the longing for freedom unfolds as Rapunzel discovers there's a whole world waiting for her.\n\nThis romantic fairy tale features multiple character voices, gentle ambient music, and a warm storytelling pace. A classic Brothers Grimm tale reimagined as a soothing bedtime experience.",
  },
  "The Princess and the Pea": {
    emoji: "👑",
    desc: "A prince travels the world searching for a true princess to marry, but no one seems quite right. Then one stormy night, a young woman appears at the castle door — soaking wet, shivering, and claiming to be a real princess. The clever queen devises the ultimate test: she hides a tiny pea under twenty mattresses and twenty feather beds. Only a true princess would be sensitive enough to feel it! A charming, funny tale about authenticity and being true to yourself.\n\nMulti-voice narration with playful character personalities, cozy rainstorm sounds, and gentle music make this short fairy tale a delightful bedtime treat.",
  },
  "Puss in Boots": {
    emoji: "🐱",
    desc: "When a poor miller's son inherits nothing but a cat, he thinks his luck has run out. But this is no ordinary cat — Puss is clever, dashing, and has a plan! Dressed in magnificent boots and armed with wit and charm, Puss outwits an ogre, impresses a king, and transforms his humble master into the wealthy Marquis of Carabas. A delightful tale about resourcefulness, loyalty, and the power of a good friend.\n\nThis swashbuckling audio drama features a wonderfully charismatic Puss with multiple character voices, playful sound effects, and gentle background music perfect for bedtime.",
  },
  "The Tortoise and the Hare": {
    emoji: "🐢",
    desc: "A speedy hare challenges a slow, steady tortoise to a race, absolutely confident of an easy victory. The hare zooms ahead, takes a nap under a tree, and assumes there's no way he can lose. But the tortoise keeps plodding along, step by step, never stopping, never giving up. The classic Aesop's fable proving that slow and steady wins the race — and that overconfidence can be your greatest weakness.\n\nA fun, engaging audio drama with distinct voices for the tortoise, the hare, and the cheering woodland animals. Gentle pacing and warm music teach an important life lesson while creating the perfect bedtime mood.",
  },
  "The Boy Who Cried Wolf": {
    emoji: "🐺",
    desc: "A bored young shepherd boy, tasked with watching over the village flock, decides to have some fun by crying 'Wolf! Wolf!' and watching the villagers come running. He tricks them once, twice — but when a real wolf finally appears on the hillside, nobody believes him anymore. A timeless Aesop's fable about honesty, trust, and why telling the truth matters — even when it's not exciting.\n\nMulti-voice narration brings the shepherd boy, worried villagers, and wise elders to life. With pastoral ambient sounds and gentle music, this story delivers an important moral lesson wrapped in a soothing bedtime experience.",
  },
  "Pinocchio, the Wooden Boy": {
    emoji: "🪵",
    desc: "A lonely woodcarver named Geppetto carves a wooden puppet and wishes upon a star for a real boy. When the puppet comes to life as Pinocchio, his adventures begin — from talking crickets and puppet shows to the belly of a giant whale! Every time Pinocchio tells a lie, his nose grows longer. Through temptation, mistakes, and genuine remorse, Pinocchio learns that honesty, bravery, and selflessness are what make someone truly real.\n\nThis beloved tale features multi-voice narration with distinct character voices, dramatic adventure sequences, and calming ambient music. A rich, immersive audio drama perfect for bedtime.",
  },
  "The Wizard of Oz": {
    emoji: "🌪️",
    desc: "A powerful tornado whisks young Dorothy and her little dog Toto from their Kansas farm to the magical Land of Oz. To find her way home, Dorothy must follow the yellow brick road to the Emerald City and meet the mysterious Wizard. Along the way she befriends a Scarecrow who wants a brain, a Tin Woodman who longs for a heart, and a Cowardly Lion searching for courage. Together they face the Wicked Witch and discover that what they were looking for was inside them all along.\n\nAn epic audio drama with unique voices for every beloved character, enchanting sound effects, and gentle music that makes this grand adventure perfect for bedtime listening.",
  },
  "The Tale of Peter Rabbit": {
    emoji: "🐰",
    desc: "Despite his mother's strict warning to stay away, a mischievous little rabbit named Peter squeezes under the gate and into Mr. McGregor's garden. He munches on radishes and lettuces, but when Mr. McGregor spots him — the chase is on! Peter loses his shoes, his jacket, and nearly his freedom before finally making it home to a warm bed and chamomile tea. A gentle Beatrix Potter tale about curiosity, consequences, and the comfort of home.\n\nCharmingly narrated with multiple character voices, garden sound effects, and the softest ambient music. A cozy, calming story that's been putting children to sleep for over a century.",
  },
  "Winnie-the-Pooh and the Honey Tree": {
    emoji: "🍯",
    desc: "A lovable, round bear of very little brain goes on a grand quest for his favorite thing in the whole world — honey! Winnie-the-Pooh climbs trees, disguises himself as a rain cloud, and gets hilariously stuck in Rabbit's doorway after eating too much. With help from his friends Christopher Robin, Piglet, and the ever-patient Rabbit, Pooh's adventures in the Hundred Acre Wood are full of warmth, humor, and gentle wisdom.\n\nThis cozy audio drama captures the magic of A.A. Milne's beloved characters with distinct voices for each friend. Warm narration and dreamy ambient music make it the ultimate comfort bedtime story.",
  },
  "Sleeping Beauty": {
    emoji: "🌹",
    desc: "At a royal christening, a wicked fairy places a terrible curse on the baby princess — on her sixteenth birthday, she will prick her finger on a spindle and fall into an eternal sleep. Despite the king's desperate efforts, the curse comes true, and the entire kingdom is wrapped in thorny roses and deep slumber. Only a brave prince can break through the enchantment and awaken the princess with true love's kiss. A dreamy tale of magic, patience, and the power of love.\n\nThis enchanting audio drama features multiple character voices, magical sound effects, and the most soothing, sleep-inducing ambient music. A fairy tale that's practically designed for bedtime.",
  },
  "The Frog Prince": {
    emoji: "🐸",
    desc: "A spoiled princess accidentally drops her favorite golden ball into a deep well. A friendly frog offers to retrieve it — but only if she promises to let him eat from her plate, drink from her cup, and sleep on her pillow. The princess agrees, but when the frog shows up at the castle, she doesn't want to keep her word! Through persistence, kindness, and a lesson about keeping promises, she discovers that the little frog is more than he appears.\n\nA charming Brothers Grimm tale narrated with playful character voices, gentle humor, and calming music. A wonderful bedtime story about honesty, kindness, and looking beyond appearances.",
  },
  "The Elves and the Shoemaker": {
    emoji: "🧵",
    desc: "A poor, kindhearted shoemaker has only enough leather for one last pair of shoes. He cuts the pieces and goes to bed — but when he wakes up, the most beautiful shoes he's ever seen are sitting on his workbench! Night after night, mysterious helpers craft exquisite shoes while the shoemaker sleeps, and his fortune grows. When he and his wife finally discover that tiny elves are behind the magic, they find a wonderful way to say thank you. A heartwarming tale about gratitude, generosity, and unexpected kindness.\n\nMulti-voice narration with gentle, magical atmosphere and warm ambient music. A cozy, feel-good bedtime story that children adore.",
  },
  "Jack and the Seven League Boots": {
    emoji: "👢",
    desc: "A brave young boy named Jack discovers a pair of magical boots that let him cross seven leagues in a single enormous step! With these enchanted boots, Jack embarks on a grand adventure filled with fearsome giants, hidden treasure, and daring rescues. Using cleverness rather than strength, Jack outsmarts every obstacle and proves that the biggest heroes sometimes come in the smallest packages.\n\nAn exciting adventure narrated with multiple character voices, thrilling sound effects, and calming background music that keeps the excitement high while gently winding down for bedtime.",
  },
  "Rumpelstiltskin": {
    emoji: "🧶",
    desc: "A miller boasts to the king that his daughter can spin straw into gold. Locked in a tower room filled with straw, the terrified girl is visited by a mysterious little man who offers to help — but his price grows higher each time. First her necklace, then her ring, and finally... her firstborn child! When the queen must guess the little man's strange name to save her baby, the tension builds to a thrilling conclusion. Can she discover his secret before it's too late?\n\nThis gripping Brothers Grimm tale features multi-voice narration with a wonderfully mischievous Rumpelstiltskin. Atmospheric music and gentle pacing make it a captivating yet soothing bedtime listen.",
  },
  "Thumbelina": {
    emoji: "🌷",
    desc: "A tiny girl no bigger than a thumb is born from a magical flower and named Thumbelina. Her miniature world is full of giant adventures — she's carried away by a toad who wants her as a bride, rescued by friendly fish and butterflies, taken underground by a bossy mole, and finally finds her way to a sun-drenched kingdom of flower fairies where she truly belongs. A delicate Hans Christian Andersen tale about finding where you fit in the world.\n\nBeautifully narrated with multiple character voices, nature sounds, and the gentlest ambient music. A dreamy, magical story perfect for helping little ones drift off to sleep.",
  },
  "The Golden Goose": {
    emoji: "🪿",
    desc: "A kind-hearted young man named Simpleton (though he's smarter than everyone thinks!) shares his lunch with a mysterious old man in the forest and receives a golden goose in return. But there's a catch — everyone who touches the goose gets magically stuck! Soon a whole parade of stuck villagers follows Simpleton through town, creating the most hilarious sight anyone has ever seen. When a sad princess who has never laughed in her life sees the ridiculous procession, she bursts into giggles — and the king must keep his promise that whoever makes her laugh shall marry her.\n\nA wonderfully funny Brothers Grimm tale with multi-voice narration and warm ambient music. Perfect for bedtime giggles before sleep.",
  },
  "The Bremen Town Musicians": {
    emoji: "🎵",
    desc: "Four aging animals — a donkey too old to carry grain, a dog too tired to hunt, a cat who can no longer chase mice, and a rooster about to become soup — set off on a grand adventure to become street musicians in the town of Bremen. Along the way, they discover a robbers' cottage and use their combined talents (braying, barking, meowing, and crowing all at once!) to scare the thieves away. They never do make it to Bremen, but they find something even better — a home and friendship.\n\nA delightful Brothers Grimm tale about friendship, teamwork, and finding your place in the world. Multi-voice narration with charming animal character voices and gentle music make this a beloved bedtime classic.",
  },
  "The Brave Little Tailor": {
    emoji: "🪡",
    desc: "When a clever little tailor swats seven flies in one blow, he embroiders a belt proclaiming 'Seven at One Blow!' and sets off to seek his fortune. Everyone assumes he killed seven giants, and his reputation grows with every step! Through wit and quick thinking (rather than brute strength), the tailor outwits two grumpy giants, captures a fierce unicorn, traps a wild boar, and wins the king's impossible challenges — along with the princess's hand in marriage.\n\nA rollicking Brothers Grimm adventure featuring multi-voice narration with a wonderfully boastful tailor, bumbling giants, and a skeptical king. Playful yet calming, with gentle ambient music perfect for an exciting bedtime story.",
  },
  "The Pied Piper of Hamelin": {
    emoji: "🪈",
    desc: "When the town of Hamelin is overrun by thousands of mischievous rats — gnawing through barrels, stealing food, and causing chaos everywhere — the desperate townspeople beg Mayor Hubert for help. A mysterious stranger in a patchwork coat appears, carrying a magical pipe, and offers to rid the town of rats for a bag of gold. His enchanted melody lures every rat into the river, and Hamelin celebrates! But when greedy Mayor Hubert breaks his promise and refuses to pay, the Pied Piper plays a different tune — one that draws the children of Hamelin away into the mountains.\n\nA timeless tale about honesty, keeping promises, and the magic of music. Featuring multi-voice narration with distinct character voices, haunting flute melodies, and calming ambient music. A powerful bedtime story with a gentle resolution and an important moral lesson.",
  },
  "The Emperor's New Clothes": {
    emoji: "👔",
    desc: "A vain emperor who loves nothing more than fine clothes hires two cunning swindlers who promise him the most magnificent suit ever made — fabric so special that it's invisible to anyone who is foolish or unfit for their position. Not wanting to appear stupid, the emperor, his ministers, and the entire kingdom pretend they can see the beautiful clothes. It takes one honest little child to shout what everyone is thinking: 'But he has nothing on at all!' A hilarious Hans Christian Andersen tale about honesty, vanity, peer pressure, and the courage to speak the truth.\n\nMulti-voice narration brings the pompous emperor, sneaky swindlers, and nervous courtiers to life with wonderful humor. Gentle music and a warm, playful tone make this a bedtime favorite.",
  },
  "The Twelve Dancing Princesses": {
    emoji: "💃",
    desc: "Every morning, twelve princesses wake up with their dancing shoes completely worn through — but no one can discover where they go at night! The king offers a great reward to anyone who can solve the mystery, but every prince who tries falls asleep and fails. When a kind, clever soldier receives a magical cloak of invisibility from a wise old woman, he follows the princesses through a hidden trapdoor, down a staircase, and into breathtaking underground kingdoms of silver trees, golden trees, and diamond trees, where they dance the night away in an enchanted palace.\n\nA magical Brothers Grimm fairy tale with multi-voice narration, shimmering sound effects, and dreamy ambient music. The perfect bedtime story for children who love dancing, princesses, and secrets.",
  },
  "Stone Soup": {
    emoji: "🍲",
    desc: "A hungry, clever traveler arrives in a small village where nobody wants to share their food. 'I have nothing to spare!' says every villager who slams their door. But the traveler has a trick — he announces he'll make the most delicious soup in the world from nothing but a stone and water! Curious villagers gather around, and one by one, they're convinced to add 'just a little something' — an onion here, a carrot there, some potatoes, some salt. Before long, the whole village is sharing the most wonderful feast anyone can remember.\n\nA warm, funny folk tale about generosity, community, and the magic of sharing. Multi-voice narration with charming villager characters and cozy ambient music make this a heartwarming bedtime story.",
  },
  "The Little Red Hen": {
    emoji: "🐔",
    desc: "A hardworking little red hen finds a grain of wheat and asks her farmyard friends — the lazy cat, the sleepy dog, and the noisy duck — for help planting it. 'Not I!' they all say. She asks for help watering, harvesting, grinding the flour, and baking the bread. 'Not I! Not I! Not I!' they repeat every time. But when the warm, golden, delicious bread comes fresh out of the oven and its wonderful smell fills the farmyard? Suddenly everyone wants to help eat it! 'Then I shall eat it myself,' says the little red hen — and she does.\n\nA beloved tale about hard work, fairness, and the satisfaction of earning your rewards. Fun multi-voice narration with playful animal characters and gentle music. A perfect bedtime story with a clear, important lesson.",
  },
  "Beauty and the Beast": {
    emoji: "🌹",
    desc: "When a merchant plucks a rose from a mysterious castle garden, a fearsome Beast demands a terrible price. The merchant's kind and courageous daughter, Beauty, offers to take her father's place. Living in the enchanted castle, Beauty slowly discovers that beneath the Beast's frightening exterior beats the gentlest of hearts. He gives her a magnificent library, beautiful gardens, and treats her with nothing but kindness. As Beauty looks beyond appearances and learns to love the Beast for who he truly is, a powerful enchantment begins to break.\n\nA timeless tale of love, kindness, inner beauty, and transformation. Multi-voice narration with rich character development, magical atmosphere, and the most soothing ambient music. One of the greatest fairy tales ever told, reimagined as a gentle bedtime experience.",
  },
  "The Steadfast Tin Soldier": {
    emoji: "🪖",
    desc: "Among twenty-five tin soldiers, one stands out — he has only one leg, cast last from the mold when the tin ran short. But he stands just as straight and proud as any soldier with two legs. He falls deeply in love with a beautiful paper ballerina who stands on one leg in a perfect arabesque. When a jealous goblin sets events in motion, the tin soldier embarks on an incredible journey — tumbling from a windowsill, sailing through rain gutters in a paper boat, being swallowed by an enormous fish, and facing danger after danger with unwavering courage and steadfast devotion.\n\nA touching Hans Christian Andersen classic about loyalty, bravery, and enduring love. Multi-voice narration with atmospheric sound effects and gentle, emotional music make this a beautiful and moving bedtime story.",
  },
  "The Little Match Girl": {
    emoji: "🕯️",
    desc: "On a bitterly cold New Year's Eve, a barefoot little girl wanders the snowy streets, selling matches that no one will buy. Too afraid to go home to her harsh father, she huddles in a corner and begins striking her matches one by one. Each tiny flame brings a beautiful vision — a warm stove, a magnificent feast, a glowing Christmas tree, and finally, her beloved grandmother, the only person who ever showed her true kindness.\n\nA poignant Hans Christian Andersen tale about hope, warmth, and love even in the coldest of circumstances. Gentle, emotional narration with soft ambient music makes this a deeply moving bedtime story.",
  },
  "Ali Baba and the Forty Thieves": {
    emoji: "💰",
    desc: "A humble woodcutter named Ali Baba discovers the secret cave of forty fearsome thieves, hidden deep in the desert mountains. 'Open, Sesame!' — the magic words reveal a cavern overflowing with gold, jewels, and treasure beyond imagination. But when the ruthless chief thief discovers someone knows their secret, Ali Baba and his clever servant Morgiana must outwit the entire band of thieves to survive.\n\nA thrilling Arabian Nights adventure with multi-voice narration, dramatic sound effects, and calming ambient music. Full of cunning, courage, and the triumph of cleverness over brute force.",
  },
  "The Jungle Book": {
    emoji: "🐯",
    desc: "A young boy named Mowgli is raised by wolves in the heart of the Indian jungle. Under the watchful eyes of Bagheera the wise panther and Baloo the lovable bear, Mowgli learns the laws of the jungle and discovers the meaning of family, loyalty, and belonging. But the fearsome tiger Shere Khan believes the man-cub has no place among the animals, setting the stage for an epic confrontation.\n\nRudyard Kipling's timeless adventure brought to life with multi-voice narration, lush jungle sound effects, and soothing ambient music. A story about identity, courage, and finding where you truly belong.",
  },
  "The Snow Queen": {
    emoji: "❄️",
    desc: "A brave girl embarks on an epic journey through enchanted forests, royal palaces, and frozen wastelands to rescue her best friend from the Snow Queen's icy palace. Along the way she meets a wise raven, kind royals, a spirited robber girl, and a loyal reindeer — each helping her get closer to the Snow Queen's domain. But only the warmth of true friendship can melt the Snow Queen's icy spell.\n\nA beloved Hans Christian Andersen fairy tale about the power of love, courage, and friendship. Multi-voice narration with atmospheric winter sound effects and gentle, enchanting ambient music create the perfect bedtime atmosphere.",
  },
  "The Nutcracker": {
    emoji: "🎄",
    desc: "On a magical Christmas Eve, a girl receives a special nutcracker toy from a mysterious visitor. When the clock strikes midnight, the nutcracker comes to life and leads her into an enchanted battle against the Mouse King and his army. After a brave victory, she is whisked away to the magical Land of Sweets, where dancing snowflakes, sugar plum fairies, and wonderful performers celebrate their arrival.\n\nA beloved holiday classic brought to life with multi-voice narration, magical sound effects, and dreamy ambient music. The perfect bedtime story for the holiday season and beyond.",
  },
};

// ── Main ──
async function main() {
  console.log("🎙️ Generating Spotify Marketing doc...\n");

  const episodeEntries = [];
  let num = 0;

  for (const story of PODCAST_STORIES) {
    num++;
    process.stdout.write(`📖 ${num}. ${story.title}\n`);

    const mp3Path = findMp3(story.title);
    let durationMin = "??";

    if (mp3Path) {
      try {
        const dur = getAudioDuration(mp3Path);
        durationMin = Math.round(dur / 60);
        console.log(`   ✅ ${durationMin} min`);
      } catch (err) {
        console.log(`   ⚠️ Duration detection failed: ${err.message}`);
      }
    } else {
      console.log(`   ❌ No MP3 found`);
      continue;
    }

    const data = STORY_DATA[story.title];
    if (!data) {
      console.log(`   ⚠️ No STORY_DATA entry — skipping`);
      continue;
    }

    // Spotify title: simpler than YouTube
    let shortTitle = story.title;
    if (story.title === "Pinocchio, the Wooden Boy") shortTitle = "Pinocchio";
    if (story.title === "Pocahontas, Daughter of the River")
      shortTitle = "Pocahontas";
    if (story.title === "Winnie-the-Pooh and the Honey Tree")
      shortTitle = "Winnie-the-Pooh";
    if (story.title === "Marina the Little Mermaid")
      shortTitle = "The Little Mermaid";

    const titleStr = `${shortTitle} — Bedtime Story for Kids (${durationMin} Min)`;

    // Spotify description (max ~4000 chars)
    const storySlug = titleToSlug(story.title);
    const description = `🌙 ${story.title} — a soothing bedtime story for kids ages 3-7.

${data.desc}

Gentle multi-voice narration with calming ambient music, perfect for drifting off to sleep. ✨

📖 Read this story with illustrations and word highlighting:
https://goreadling.com/stories/${storySlug}

📱 Download GoReadling — AI bedtime stories with illustrations and learning games:
https://apps.apple.com/app/goreadling/id6755505679

${YOUTUBE_IDS[story.title] ? `📺 Watch this story on YouTube:\nhttps://www.youtube.com/watch?v=${YOUTUBE_IDS[story.title]}` : `📺 More stories on YouTube:\nhttps://www.youtube.com/@goreadling`}

📚 More free bedtime stories: https://goreadling.com/stories

You might also enjoy:
${(() => {
      const others = PODCAST_STORIES.filter(s => s.title !== story.title);
      const picks = others.sort(() => 0.5 - Math.random()).slice(0, 3);
      return picks.map(s => `${s.title}: https://goreadling.com/stories/${titleToSlug(s.title)}`).join('\n');
    })()}

Keywords: bedtime story, ${story.title.toLowerCase()}, kids story, children's story, sleep story, fairy tale, bedtime for kids, soothing narration, story time, read aloud, bedtime stories for kids, goreadling, audio story, free bedtime stories, stories for toddlers`;

    let entry = `
═══════════════════════════════════════════════════
EPISODE ${num}: ${story.title}
═══════════════════════════════════════════════════

Title:
${titleStr}

Description:
${description}`;

    episodeEntries.push(entry);
  }

  // Write full file
  const header = `# GoReadling Bedtime Stories — Spotify Marketing
# Show: GoReadling Bednight Stories
# Copy-paste titles and descriptions for each episode upload
# Links:
#   Website: https://goreadling.com
#   App Store: https://apps.apple.com/app/goreadling/id6755505679
#   Spotify Show: https://open.spotify.com/show/5Xibl3BuCkhfxRJRu5v6ML
#   YouTube: @NightStories


═══════════════════════════════════════════════════
SPOTIFY EPISODE CHECKLIST (do for EVERY episode upload)
═══════════════════════════════════════════════════

Before uploading each episode, go through this checklist:

□ MP3 file: Upload from exports/stories/<SafeTitle>_MMDDYYYY/spotify/<SafeTitle>.mp3
□ Title: Use the title format below (Story — Bedtime Story for Kids (XX Min))
□ Description: Copy-paste the description below
□ Episode type: Set to "Full Episode"
□ Season: Leave blank (single-season show)
□ Explicit content: No
□ Publish date: Set to today or schedule
□ After publishing: Copy the Spotify episode URL
□ Update SPOTIFY_IDS in seedBednightStories.mjs with the episode ID
□ Re-seed Firestore to update the Spotify link on the website`;

  const output = header + "\n" + episodeEntries.join("\n") + "\n";
  fs.writeFileSync(OUTPUT_FILE, output, "utf8");
  console.log(
    `\n✅ Wrote ${OUTPUT_FILE} (${episodeEntries.length} episodes)`
  );
}

main();
