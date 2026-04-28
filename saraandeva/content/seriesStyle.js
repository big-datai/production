/**
 * Sara & Eva — Locked Series Visual Style
 *
 * Single source of truth for the show's look. Injected into every
 * illustration prompt and every Kling storyboard shot description so the
 * show reads as one consistent visual IP across episodes.
 *
 * DO NOT casually edit this file. Once the first episodes ship, changing
 * this string causes style drift and the show stops feeling like the same
 * show. Any edit is a versioned decision.
 */

export const SERIES_STYLE = `Modern 3D CG animated-children's-show style, in the spirit of Like Nastya animated segments and CoComelon 3D. Soft cel-shaded rendering with clean specular highlights, warm rim light, subtle subsurface scattering on skin. Slightly stylized proportions — large expressive eyes with detailed highlights, simple rounded noses, friendly natural smiles. Saturated but natural palette, no flat primaries. Clean geometric backgrounds with depth and soft bokeh, daytime lighting, warm fill. Characters clearly recognizable across every scene. No gritty realism, no horror lighting, no dark shadows on faces. Always bright, warm, safe, inviting.`;

/**
 * Neutral background used for all character turnaround sheet renders so the
 * compounding-reference chain (front → 3/4 → profile) isn't confused by
 * different backgrounds.
 */
export const AVATAR_BACKGROUND = `Plain soft warm cream/ivory background with a very gentle radial gradient. No props, no environment, no shadows except a small soft contact shadow under the feet.`;

/**
 * Framing for canonical avatar character sheets.
 */
export const AVATAR_FRAMING = `Full body, head to feet visible, character centered, filling about 75% of frame height. Arms slightly away from the body in a neutral T-pose variant (not rigid — natural rest pose with weight on one leg). Neutral friendly expression, gentle smile, looking toward camera unless the view says otherwise.`;

/**
 * View-specific camera notes. Each view gets rendered sequentially, with
 * previous views passed as additional reference images (compounding refs)
 * so the face/outfit/proportions stay locked across angles.
 */
export const AVATAR_VIEWS = {
  front: {
    label: "front",
    cameraNote: "Camera directly in front of the character at the character's eye level. The character faces the camera head-on.",
  },
  "3q": {
    label: "3-quarter",
    cameraNote: "Camera at 45 degrees to the character's right, at the character's eye level. The character's body is turned slightly to show the three-quarter angle. Face still visible, nose silhouette begins to appear. Match the face, outfit, hair, and proportions EXACTLY from the front view reference — this is the same character, same moment, different angle.",
  },
  profile: {
    label: "profile",
    cameraNote: "Camera at 90 degrees to the character's right, at the character's eye level. Strict side profile. Match the face, outfit, hair, and proportions EXACTLY from the front and 3-quarter references — this is the same character, same moment, different angle.",
  },
};

export default SERIES_STYLE;
