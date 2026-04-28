import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function check(model) {
  try {
    await ai.models.generateContent({
      model,
      contents: 'Say hello',
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
      }
    });
    console.log(model + ': ✅ AVAILABLE (quota OK)');
  } catch (e) {
    const msg = String(e).slice(0, 500);
    console.log(model + ': ❌ ' + msg);
  }
}

(async () => {
  console.log('Checking TTS model quotas...\n');
  await check('gemini-2.5-flash-preview-tts');
  await check('gemini-2.5-pro-preview-tts');
  console.log('\nTier 1 daily limits: Flash=100/day, Pro=50/day (resets ~midnight PT)');
})();
