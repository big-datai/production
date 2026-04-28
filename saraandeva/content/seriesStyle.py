"""
Sara & Eva — Locked Series Visual Style (Python)

Single source of truth for the show's look. Injected into every
illustration prompt and every Kling storyboard shot description so the
show reads as one consistent visual IP across episodes.

DO NOT casually edit this file. Once the first episodes ship, changing
these strings causes style drift and the show stops feeling like the same
show. Any edit is a versioned decision.
"""

SERIES_STYLE = (
    "Modern 3D CG animated-children's-show style, in the spirit of Like Nastya "
    "animated segments and CoComelon 3D. Soft cel-shaded rendering with clean "
    "specular highlights, warm rim light, subtle subsurface scattering on skin. "
    "Slightly stylized proportions — large expressive eyes with detailed highlights, "
    "simple rounded noses, friendly natural smiles. Saturated but natural palette, "
    "no flat primaries. Clean geometric backgrounds with depth and soft bokeh, "
    "daytime lighting, warm fill. Characters clearly recognizable across every "
    "scene. No gritty realism, no horror lighting, no dark shadows on faces. "
    "Always bright, warm, safe, inviting."
)

AVATAR_BACKGROUND = (
    "Plain soft warm cream/ivory background with a very gentle radial gradient. "
    "No props, no environment, no shadows except a small soft contact shadow "
    "under the feet."
)

AVATAR_FRAMING = (
    "Full body, head to feet visible, character centered, filling about 75% of "
    "frame height. Arms slightly away from the body in a natural rest pose "
    "(weight on one leg, not rigid T-pose). Neutral friendly expression, gentle "
    "smile, looking toward the camera unless the view says otherwise."
)

AVATAR_VIEWS = {
    "front": {
        "label": "front",
        "camera_note": (
            "Camera directly in front of the character at the character's eye "
            "level. The character faces the camera head-on."
        ),
    },
    "3q": {
        "label": "3-quarter",
        "camera_note": (
            "Camera at 45 degrees to the character's right, at the character's "
            "eye level. The character's body is turned slightly to show the "
            "three-quarter angle. Face still visible, nose silhouette begins to "
            "appear. Match the face, outfit, hair, and proportions EXACTLY from "
            "the front-view reference — this is the same character, same moment, "
            "different angle."
        ),
    },
    "profile": {
        "label": "profile",
        "camera_note": (
            "Camera at 90 degrees to the character's right, at the character's "
            "eye level. Strict side profile. Match the face, outfit, hair, and "
            "proportions EXACTLY from the front and 3-quarter references — this "
            "is the same character, same moment, different angle."
        ),
    },
}
