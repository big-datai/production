/**
 * Central language configuration for multilingual story pipeline.
 * All scripts reference this for language codes, TTS settings, and platform IDs.
 */

export const LANGUAGES = {
  en: {
    code: "en",
    name: "English",
    nativeName: "English",
    geminiLang: "en-US",
    ytPlaylist: "PLLiQnta0Yb9iOZ-9TLfYOnRG5mrOaF0aV", // Night Stories
    spotifyShow: "5Xibl3BuCkhfxRJRu5v6ML",
    titleSuffix: "Bedtime Story for Kids",
    titlePattern: (title, mins) => `${title} — Bedtime Story for Kids (${mins} Min)`,
    descIntro: (title) => `🌙 ${title} — a soothing bedtime story for kids ages 3-7.`,
  },
  es: {
    code: "es",
    name: "Spanish",
    nativeName: "Español",
    geminiLang: "es-ES",
    ytPlaylist: "PLLiQnta0Yb9jmKWA4ZB8dj8lMjQkb7kkU",
    spotifyShow: "", // TODO: create show, add ID
    titleSuffix: "Cuento para Dormir para Niños",
    titlePattern: (title, mins) => `${title} — Cuento para Dormir para Niños (${mins} Min)`,
    descIntro: (title) => `🌙 ${title} — un cuento relajante para dormir para niños de 3 a 7 años.`,
  },
  pt: {
    code: "pt",
    name: "Portuguese",
    nativeName: "Português",
    geminiLang: "pt-BR",
    ytPlaylist: "PLLiQnta0Yb9hnbBdEa28Z_hC7Yg5IV0e4",
    spotifyShow: "", // TODO: create show
    titleSuffix: "História para Dormir para Crianças",
    titlePattern: (title, mins) => `${title} — História para Dormir para Crianças (${mins} Min)`,
    descIntro: (title) => `🌙 ${title} — uma história relaxante para dormir para crianças de 3 a 7 anos.`,
  },
  ar: {
    code: "ar",
    name: "Arabic",
    nativeName: "العربية",
    geminiLang: "ar-XA",
    ytPlaylist: "PLLiQnta0Yb9heqk7Cf9hx60itJ3V4M0FR",
    spotifyShow: "", // TODO: create show
    titleSuffix: "قصة قبل النوم للأطفال",
    titlePattern: (title, mins) => `${title} — قصة قبل النوم للأطفال (${mins} دقيقة)`,
    descIntro: (title) => `🌙 ${title} — قصة مهدئة قبل النوم للأطفال من 3 إلى 7 سنوات.`,
  },
  hi: {
    code: "hi",
    name: "Hindi",
    nativeName: "हिन्दी",
    geminiLang: "hi-IN",
    ytPlaylist: "PLLiQnta0Yb9gFaGNY6BS4Mnomhmn7dz4_",
    spotifyShow: "", // TODO: create show
    titleSuffix: "बच्चों की सोने की कहानी",
    titlePattern: (title, mins) => `${title} — बच्चों की सोने की कहानी (${mins} मिनट)`,
    descIntro: (title) => `🌙 ${title} — 3 से 7 साल के बच्चों के लिए एक आरामदायक सोने की कहानी।`,
  },
  ru: {
    code: "ru",
    name: "Russian",
    nativeName: "Русский",
    geminiLang: "ru-RU",
    ytPlaylist: "PLLiQnta0Yb9ic1p_gNLmgOX0WX6crSJiT",
    spotifyShow: "", // TODO: create show
    titleSuffix: "Сказка на ночь для детей",
    titlePattern: (title, mins) => `${title} — Сказка на ночь для детей (${mins} мин)`,
    descIntro: (title) => `🌙 ${title} — расслабляющая сказка на ночь для детей от 3 до 7 лет.`,
  },
};

export const SUPPORTED_LANGS = Object.keys(LANGUAGES).filter((l) => l !== "en");

export function getLang(code) {
  const lang = LANGUAGES[code];
  if (!lang) throw new Error(`Unknown language: ${code}. Supported: ${Object.keys(LANGUAGES).join(", ")}`);
  return lang;
}

// 11 Kling stories (have animated video — these are the ones we translate + upload)
export const KLING_STORIES = [
  "The Pied Piper of Hamelin",
  "The Golden Goose",
  "The Brave Little Tailor",
  "The Steadfast Tin Soldier",
  "Beauty and the Beast",
  "The Little Red Hen",
  "The Jungle Book",
  "Stone Soup",
  "The Emperor's New Clothes",
  "The Twelve Dancing Princesses",
  "The Little Match Girl",
];

// 32 stories that have complete assets (MP3 + MP4 + SRT + illustrations)
export const TRANSLATABLE_STORIES = [
  "Beauty and the Beast",
  "Cinderella",
  "Goldilocks and the Three Bears",
  "Hansel and Gretel",
  "Jack and the Beanstalk",
  "Jack and the Seven League Boots",
  "Little Red Riding Hood",
  "Marina the Little Mermaid",
  "Pinocchio, the Wooden Boy",
  "Puss in Boots",
  "Rapunzel",
  "Rumpelstiltskin",
  "Stone Soup",
  "The Brave Little Tailor",
  "The Bremen Town Musicians",
  "The Elves and the Shoemaker",
  "The Emperor's New Clothes",
  "The Gingerbread Man",
  "The Golden Goose",
  "The Jungle Book",
  "The Little Match Girl",
  "The Little Red Hen",
  "The Pied Piper of Hamelin",
  "The Princess and the Pea",
  "The Steadfast Tin Soldier",
  "The Tale of Peter Rabbit",
  "The Three Little Pigs",
  "The Tortoise and the Hare",
  "The Twelve Dancing Princesses",
  "The Ugly Duckling",
  "The Wizard of Oz",
  "Thumbelina",
];
