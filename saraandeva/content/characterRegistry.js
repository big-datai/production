/**
 * Sara & Eva — Cartoon Character Registry
 *
 * Cast for the @SaraandEva YouTube series. Schema mirrors
 * assets/characters/recurringCharacters.json so existing pipeline code
 * (generatePodcast.mjs, generateYoutubeVideos.mjs) can consume it with
 * minimal glue.
 *
 * Voice notes:
 *   - Sara, Eva, Bunsy, Ginger: voices proven in existing pipeline.
 *   - George: Zephyr is a starting guess. Test with a single-segment
 *     TTS sample before locking. Fallback: Iapetus or Puck pitched up.
 */

export const CARTOON_CHARACTERS = [
  {
    id: "sara",
    name: "Sara",
    role: "The Big Sister",
    species: "human",
    age: "6-year-old girl",
    personality: "Thoughtful, curious, a little bossy in a caring way. She asks a lot of questions and treats every small problem like a detective case. Protective of Eva even when annoyed with her.",
    body: "Average height for age 6, slightly lanky, always a bit of energy in her stance",
    face: "Warm hazel eyes, round cheeks with a dusting of freckles across the nose, a quick thoughtful frown when she's figuring something out",
    hair: "Wavy shoulder-length dark brown hair, often with a small clip or a loose braid on one side",
    skin: "Warm light olive complexion",
    outfit: "Purple t-shirt with a small star pattern, denim overalls, yellow sneakers (her favorite). Sometimes swaps the t-shirt for a purple cardigan.",
    features: "Always notices things first. Carries a tiny pink notebook for 'important observations'.",
    voice: "Kore",
    voiceStyle: "Warm, curious, slightly measured — the older-sibling voice",
    storyRoles: ["big sister", "detective", "helper", "older kid", "thinker"],
    avatarPath: "assets/cartoon/characters/sara.png",
  },
  {
    id: "eva",
    name: "Eva",
    role: "The Little Sister",
    species: "human",
    age: "4-year-old girl",
    personality: "Playful, fearless, and full of feelings — big joys, big sadnesses, nothing in between. Repeats phrases when excited ('Really?! Really-really?!'). Adores George, looks up to Sara, argues with both.",
    body: "Small, round-cheeked, always moving",
    face: "Bright brown eyes, rosy round cheeks, a wide gappy smile",
    hair: "Short dark-brown hair just past the ears, usually with a pink or rainbow bow",
    skin: "Warm light olive complexion (matches Sara — they're sisters)",
    outfit: "Rainbow-striped shirt, pink skirt with sparkles along the hem, light-up sneakers. Often carrying Bunsy by one ear.",
    features: "Cannot be separated from Bunsy. Calls George 'Zhorik' (nobody knows why — Sara says it's 'her word for him').",
    voice: "Aoede",
    voiceStyle: "Bright, slightly musical, lots of expressive range — the younger-sibling voice",
    storyRoles: ["little sister", "feeler", "explorer", "youngest", "dreamer"],
    avatarPath: "assets/cartoon/characters/eva.png",
  },
  {
    id: "bunsy",
    name: "Bunsy",
    role: "The Stuffed Bunny",
    species: "stuffed toy (plush rabbit)",
    age: "Ageless (Eva's bunny since birth)",
    personality: "Eva's stuffed bunny who speaks only when the sisters are really listening. Gentle, a little silly, occasionally profound. Voice of calm when everyone else is worked up. Nobody else — parents, neighbors, the dogs — hears him.",
    body: "Small plush rabbit, sits about the size of Eva's forearm. Slightly lopsided from being loved a lot.",
    face: "Black button eyes, small pink embroidered nose, a soft lopsided smile",
    hair: "None (plush fur)",
    skin: "Cream-colored soft fur with a pink inner-ear lining. One ear slightly darker from years of being held",
    outfit: "A tiny blue bow tied at the neck (Eva tied it herself, slightly crooked, has never been retied)",
    features: "Only the sisters hear him speak. When he talks, his mouth doesn't move — his voice is just there. Often closes the episode with a quiet aside.",
    voice: "Puck",
    voiceStyle: "Soft, warm, a touch whimsical, like a secret shared",
    storyRoles: ["narrator inside the show", "wise toy", "comfort object", "conscience"],
    avatarPath: "assets/cartoon/characters/bunsy.png",
  },
  {
    id: "ginger",
    name: "Ginger",
    role: "The Jack Russell",
    species: "dog (Jack Russell Terrier)",
    age: "5 dog-years (lively adult)",
    personality: "Spunky, smart, bossy-older-sibling energy toward George. First to notice anything unusual — ears up before anyone else reacts. Loves chasing butterflies, hates vacuum cleaners, would rather be outside than inside.",
    body: "Small, athletic, compact Jack Russell build — all muscle and spring. Short legs, quick movements.",
    face: "Alert amber-brown eyes, black nose, triangular flop-ears that perk up when curious, a permanent slight smile from an upturned muzzle",
    hair: "None (short coat)",
    skin: "Short white fur with tan patches over both eyes and along the back. A distinctive tan 'saddle' across the shoulders",
    outfit: "Red collar with a small silver bone-shaped tag. Sometimes a red bandana when going on adventures.",
    features: "Ears perk up half a second before anyone notices something. Cocks her head to one side when confused — kids find it hilarious.",
    voice: "Fenrir",
    voiceStyle: "Quick, bright, slightly sharp — the bossy-but-loyal dog voice",
    storyRoles: ["family dog", "sensible one", "problem-solver", "older pet"],
    avatarPath: "assets/cartoon/characters/ginger.png",
  },
  {
    id: "george",
    name: "George",
    role: "The Pomeranian",
    species: "dog (Pomeranian)",
    age: "3 dog-years (young adult, still puppy-ish)",
    personality: "Sweet, gentle, a little goofy, easily distracted. The softie of the cast. Gets overwhelmed and spins in circles when excited. Adores Eva above all others — she calls him 'Zhorik' and he comes running. Mildly anxious in new situations; Ginger bosses him around and he doesn't mind.",
    body: "Tiny, extra-fluffy Pomeranian — about two handfuls of dog. Wedge-shaped head, fox-like face buried in fluff.",
    face: "Large dark round eyes, small black button nose, small triangular ears barely poking out of fluff, a permanent soft smile from the Pom snout",
    hair: "None (long fluffy double coat)",
    skin: "Rich gold/orange long fluffy fur, slightly lighter belly, plumed tail that curls over his back",
    outfit: "Light blue collar with a small heart-shaped tag that says 'George'. Eva sometimes puts a tiny bow on his head.",
    features: "Spins in circles when excited. Falls asleep in flower beds. Responds to both 'George' and 'Zhorik' (Eva's nickname for him).",
    voice: "Zephyr",
    voiceStyle: "Soft, round, slightly slow — gentle and dreamy, a little distracted",
    voiceNotes: "Starting guess — test with a sample before Episode 2. Fallback voices if Zephyr feels wrong: Iapetus (warmer), Puck pitched up (more playful).",
    storyRoles: ["family dog", "softie", "follower", "younger pet"],
    avatarPath: "assets/cartoon/characters/george.png",
    nicknames: ["Zhorik", "Georgie"],
  },
];

/**
 * Voice fallbacks for any unnamed incidental characters that pop up in an
 * episode (mailman, kid at the park, etc). Match the existing pipeline
 * convention in recurringCharacters.json.
 */
export const CARTOON_VOICE_FALLBACKS = {
  narrator: {
    voice: "Zephyr",
    description: "Episode narrator if needed — warm, light, storytelling cadence. In Peppa-style cartoons the narrator is used sparingly, mostly for scene transitions.",
  },
  fallbackMale: {
    voice: "Puck",
    description: "Default for unassigned male characters (dads, neighbors, etc)",
  },
  fallbackFemale: {
    voice: "Kore",
    description: "Default for unassigned female characters (moms, neighbors, etc)",
  },
  fallbackChild: {
    voice: "Aoede",
    description: "Default for unassigned child characters (kids at the park, at school)",
  },
  fallbackElder: {
    voice: "Charon",
    description: "Default for unassigned older characters (grandparents, mailman, etc)",
  },
  fallbackAnimal: {
    voice: "Fenrir",
    description: "Default for unassigned animal characters",
  },
};

/**
 * Family/relationship metadata — used by Gemini prompt construction when
 * generating character_desc.json for illustration consistency.
 */
export const CARTOON_RELATIONSHIPS = {
  siblings: [["sara", "eva"]],
  pets: {
    owners: ["sara", "eva"],
    dogs: ["ginger", "george"],
    toys: ["bunsy"],
  },
  // Sara and Eva must share visual family traits: warm light olive skin,
  // dark brown hair, hazel/brown eyes. Their (off-screen) parents have
  // the same palette. Mama = warm brown eyes, dark hair. Papa = warm
  // brown eyes, dark hair with slight salt-and-pepper.
  parents: {
    mama: {
      description: "Warm brown eyes, dark wavy shoulder-length hair, warm light olive skin, usually in jeans + a knit sweater. Mid-30s. Rarely on-screen — mostly heard from the kitchen or setting up the episode.",
      voice: "Kore",
    },
    papa: {
      description: "Warm brown eyes, dark short hair with slight salt-and-pepper at the temples, warm light olive skin, usually in a henley + chinos. Mid-30s. Rarely on-screen.",
      voice: "Charon",
    },
  },
};

export default CARTOON_CHARACTERS;
