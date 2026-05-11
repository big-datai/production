# Episode 14 — audit report
_2026-05-08 19:56:40 — 32 clips, 465s_

**Summary:** ✅ 15  🟡 9  🔴 8  ❓ 0

| Clip | Verdict | Spec | Render | Gemini | Notes |
|------|---------|------|--------|--------|-------|
| 1 | 🔴 FAIL | Sara, Eva, Papa | 7 humans | CLEAN (0) | humans_count_off: spec=3 actual=7 (diff +4) |
| 10 | ✅ PASS | young_Mama | 1 humans | CLEAN (0) | all checks clean |
| 11 | 🔴 FAIL | young_Papa, young_Mama | 4 humans | CLEAN (0) | humans_count_off: spec=2 actual=4 (diff +2) |
| 12 | 🟡 WARN | young_Papa, young_Mama | 2 humans | MINOR_ISSUES (1) | gemini_minor: 1 defects |
| 13 | ✅ PASS | young_Papa, young_Mama | 2 humans | CLEAN (0) | all checks clean |
| 14 | ✅ PASS | young_Papa, young_Mama | 2 humans | CLEAN (0) | all checks clean |
| 15 | ✅ PASS | young_Papa, young_Mama | 2 humans | CLEAN (0) | all checks clean |
| 16 | ✅ PASS | young_Papa, young_Mama | 2 humans | CLEAN (0) | all checks clean |
| 17 | 🔴 FAIL | Sara, Eva, Papa | 6 humans | MINOR_ISSUES (1) | gemini_minor: 1 defects; humans_count_off: spec=3 actual=6 (diff +3) |
| 18 | ✅ PASS | young_Papa, young_Mama | 2 humans | CLEAN (0) | all checks clean |
| 19 | 🟡 WARN | young_Papa, young_Mama, puppy_Joe | 2 humans | CLEAN (0) | humans_count_off_by_1: spec=3 actual=2; subject_missing_in_render: 'puppy_Joe' not detected in audit description |
| 2 | 🔴 FAIL | Sara, Eva, Papa | 7 humans | CLEAN (0) | humans_count_off: spec=3 actual=7 (diff +4) |
| 20 | 🟡 WARN | young_Papa, young_Mama, Joe | 2 humans | CLEAN (0) | humans_count_off_by_1: spec=3 actual=2; subject_missing_in_render: 'Joe' not detected in audit description |
| 21 | 🟡 WARN | young_Papa, young_Mama, baby_Sara | 2 humans | CLEAN (0) | humans_count_off_by_1: spec=3 actual=2 |
| 22 | 🟡 WARN | baby_Sara, Joe, young_Mama, young_Papa | 3 humans | MINOR_ISSUES (1) | gemini_minor: 1 defects; humans_count_off_by_1: spec=4 actual=3 |
| 23 | ✅ PASS | baby_Sara, baby_Eva, young_Mama | 3 humans | CLEAN (0) | all checks clean |
| 24 | 🟡 WARN | Sara, Eva, Ginger, Mama, Papa | 5 humans | CRITICAL_DEFECT (2) | gemini_critical_soft (style nits): 2 defects, none anatomy/clone; subject_missing_in_render: 'Ginger' not detected in audit description |
| 25 | ✅ PASS | Sara, Eva, Papa | 3 humans | CLEAN (0) | all checks clean |
| 26 | 🟡 WARN | Sara, Eva, Papa | 3 humans | MINOR_ISSUES (1) | gemini_minor: 1 defects |
| 27 | ✅ PASS | Sara, Eva, Papa | 3 humans | CLEAN (0) | all checks clean |
| 28 | 🔴 FAIL | Sara, Eva, Mama, Papa, Joe, Ginger | 6 humans | CRITICAL_DEFECT (3) | gemini_critical_hard: ['- ghost_or_duplicate_character: Papa appears twice, as a; subject_missing_in_render: 'Joe' not detected in audit description |
| 29 | ✅ PASS | Sara, Eva, Papa, mama_with_camera | 4 humans | CLEAN (0) | all checks clean |
| 3 | 🔴 FAIL | Sara, Eva, Papa | 5 humans | MINOR_ISSUES (1) | gemini_minor: 1 defects; humans_count_off: spec=3 actual=5 (diff +2) |
| 30 | 🔴 FAIL | Sara, Eva, Mama, Papa | 8 humans | MINOR_ISSUES (1) | gemini_minor: 1 defects; humans_count_off: spec=4 actual=8 (diff +4) |
| 4 | ✅ PASS | Papa | 1 humans | CLEAN (0) | all checks clean |
| 5 | 🔴 FAIL | young_Papa | 4 humans | CLEAN (0) | humans_count_off: spec=1 actual=4 (diff +3) |
| 6 | ✅ PASS | young_Papa, young_Mama | 2 humans | CLEAN (0) | all checks clean |
| 7.5 | ✅ PASS | young_Papa, young_Mama | 2 humans | CLEAN (0) | all checks clean |
| 7 | 🟡 WARN | young_Papa, young_Mama | 2 humans | CRITICAL_DEFECT (1) | gemini_critical_soft (style nits): 1 defects, none anatomy/clone; subject_missing_in_render: 'young_Papa' not detected in audit description |
| 8 | ✅ PASS | young_Papa, young_Mama | 2 humans | CLEAN (0) | all checks clean |
| 9 | ✅ PASS | young_Papa | 1 humans | CLEAN (0) | all checks clean |
| A | 🟡 WARN | Sara, Eva, Mama, Papa | ? | UNKNOWN (0) | subject_missing_in_render: 'Sara' not detected in audit description; subject_missing_in_render: 'Eva' not detected in audit description |

## Details (non-PASS clips)

### Clip 1 — 🔴 FAIL
- file: 6429 KB, 10.0s
- gemini overall: CLEAN
- gemini visible humans: `Papa, Sara, Eva, Mama (in photos), young_Mama (in photo), young_Papa (in photo), baby_Sara (in photo), baby_Eva (in photo)`
  - 🟡 humans_count_off: spec=3 actual=7 (diff +4)
- contact sheet: `/tmp/1_sheet.jpg`

### Clip 11 — 🔴 FAIL
- file: 7805 KB, 15.0s
- gemini overall: CLEAN
- gemini visible humans: `Papa, Mama, unknown_adult, unknown_adult`
  - 🟡 humans_count_off: spec=2 actual=4 (diff +2)
- contact sheet: `/tmp/11_sheet.jpg`

### Clip 12 — 🟡 WARN
- file: 12729 KB, 10.0s
- gemini overall: MINOR_ISSUES
- gemini visible humans: `Papa, Mama`
  - 🚩 - other: The adult female character (Mama) has the voice of a young child.
  - 🟡 gemini_minor: 1 defects
- contact sheet: `/tmp/12_sheet.jpg`

### Clip 17 — 🔴 FAIL
- file: 8783 KB, 10.0s
- gemini overall: MINOR_ISSUES
- gemini visible humans: `Papa, Sara, Eva, Mama, baby_Sara, baby_Eva`
  - 🚩 - visual_clone: The two hospital pictures on the wall (bottom left and bottom right) are identical, depicting Mama, Papa, and an identical baby.
  - 🟡 gemini_minor: 1 defects
  - 🟡 humans_count_off: spec=3 actual=6 (diff +3)
- contact sheet: `/tmp/17_sheet.jpg`

### Clip 19 — 🟡 WARN
- file: 8040 KB, 10.0s
- gemini overall: CLEAN
- gemini visible humans: `Mama, Papa`
  - 🟡 humans_count_off_by_1: spec=3 actual=2
  - 🟡 subject_missing_in_render: 'puppy_Joe' not detected in audit description
- contact sheet: `/tmp/19_sheet.jpg`

### Clip 2 — 🔴 FAIL
- file: 9018 KB, 10.0s
- gemini overall: CLEAN
- gemini visible humans: `Papa, Sara, Eva, young_Mama, young_Papa, baby_Sara, baby_Eva`
  - 🟡 humans_count_off: spec=3 actual=7 (diff +4)
- contact sheet: `/tmp/2_sheet.jpg`

### Clip 20 — 🟡 WARN
- file: 9594 KB, 10.0s
- gemini overall: CLEAN
- gemini visible humans: `Mama, Papa`
  - 🟡 humans_count_off_by_1: spec=3 actual=2
  - 🟡 subject_missing_in_render: 'Joe' not detected in audit description
- contact sheet: `/tmp/20_sheet.jpg`

### Clip 21 — 🟡 WARN
- file: 11291 KB, 15.0s
- gemini overall: CLEAN
- gemini visible humans: `young_Mama, baby_Eva`
  - 🟡 humans_count_off_by_1: spec=3 actual=2
- contact sheet: `/tmp/21_sheet.jpg`

### Clip 22 — 🟡 WARN
- file: 8586 KB, 10.0s
- gemini overall: MINOR_ISSUES
- gemini visible humans: `Mama, Papa, baby_Eva`
  - 🚩 - other: baby_Eva's walking motion is stiff and unnatural (feet slide rather than lift), Joe's tail wagging is stiff and repetitive.
  - 🟡 gemini_minor: 1 defects
  - 🟡 humans_count_off_by_1: spec=4 actual=3
  - 🟡 subject_missing_in_render: 'Joe' not detected in audit description
- contact sheet: `/tmp/22_sheet.jpg`

### Clip 24 — 🟡 WARN
- file: 9675 KB, 10.0s
- gemini overall: CRITICAL_DEFECT
- gemini visible humans: `Mama, Papa, Sara, Eva, unknown_child`
  - 🚩 - wrong_or_extra_character: An unknown baby is present, not listed in the canonical cast.
  - 🚩 - other: Papa's character model has hair, but the canonical description states "bald".
  - 🟡 gemini_critical_soft (style nits): 2 defects, none anatomy/clone
  - 🟡 subject_missing_in_render: 'Ginger' not detected in audit description
- contact sheet: `/tmp/24_sheet.jpg`

### Clip 26 — 🟡 WARN
- file: 8448 KB, 10.0s
- gemini overall: MINOR_ISSUES
- gemini visible humans: `Papa, Sara, Eva`
  - 🚩 - other: The character identified as "Mama" in the framed background pictures has dark hair, which is inconsistent with the canonical description of Mama as an adult blonde woman.
  - 🟡 gemini_minor: 1 defects
- contact sheet: `/tmp/26_sheet.jpg`

### Clip 28 — 🔴 FAIL
- file: 9136 KB, 10.0s
- gemini overall: CRITICAL_DEFECT
- gemini visible humans: `Mama, Papa, Papa, Sara, Eva, unknown_adult`
  - 🚩 - ghost_or_duplicate_character: Papa appears twice, as an identical duplicate.
  - 🚩 - wrong_or_extra_character: An unknown adult woman is present who is not part of the canonical cast.
  - 🚩 - visual_clone: Two identical Papas are present.
  - 🟡 gemini_critical_hard: ['- ghost_or_duplicate_character: Papa appears twice, as an identical duplicate.']
  - 🟡 subject_missing_in_render: 'Joe' not detected in audit description
  - 🟡 subject_missing_in_render: 'Ginger' not detected in audit description
- contact sheet: `/tmp/28_sheet.jpg`

### Clip 3 — 🔴 FAIL
- file: 8042 KB, 10.0s
- gemini overall: MINOR_ISSUES
- gemini visible humans: `Papa, Sara, Mama, baby_Sara, baby_Eva`
  - 🚩 - other: Inconsistent animation style for background framed pictures compared to foreground characters.
  - 🟡 gemini_minor: 1 defects
  - 🟡 humans_count_off: spec=3 actual=5 (diff +2)
- contact sheet: `/tmp/3_sheet.jpg`

### Clip 30 — 🔴 FAIL
- file: 11316 KB, 10.0s
- gemini overall: MINOR_ISSUES
- gemini visible humans: `Papa, Mama, Sara, Eva, young_Mama, young_Papa, baby`
  - 🚩 - ghost_or_duplicate_character: Papa, baby (appear in two identical framed pictures on the bottom left and bottom right)
  - 🟡 gemini_minor: 1 defects
  - 🟡 humans_count_off: spec=4 actual=8 (diff +4)
- contact sheet: `/tmp/30_sheet.jpg`

### Clip 5 — 🔴 FAIL
- file: 12783 KB, 10.0s
- gemini overall: CLEAN
- gemini visible humans: `Papa, unknown_adult, unknown_adult, unknown_adult`
  - 🟡 humans_count_off: spec=1 actual=4 (diff +3)
- contact sheet: `/tmp/5_sheet.jpg`

### Clip 7 — 🟡 WARN
- file: 6143 KB, 10.0s
- gemini overall: CRITICAL_DEFECT
- gemini visible humans: `unknown_adult, unknown_adult`
  - 🚩 - other: Character designs for the man and woman do not match the canonical Mama and Papa from the "Sara and Eva" series. While fitting the general description, their specific facial features, hair, and overall rendering are distinct, indicating a character design mismatch.
  - 🟡 gemini_critical_soft (style nits): 1 defects, none anatomy/clone
  - 🟡 subject_missing_in_render: 'young_Papa' not detected in audit description
  - 🟡 subject_missing_in_render: 'young_Mama' not detected in audit description
- contact sheet: `/tmp/7_sheet.jpg`

### Clip A — 🟡 WARN
- file: 9109 KB, 10.0s
- gemini overall: UNKNOWN
- gemini visible humans: ``
  - 🟡 subject_missing_in_render: 'Sara' not detected in audit description
  - 🟡 subject_missing_in_render: 'Eva' not detected in audit description
  - 🟡 subject_missing_in_render: 'Mama' not detected in audit description
  - 🟡 subject_missing_in_render: 'Papa' not detected in audit description
- contact sheet: `/tmp/A_sheet.jpg`

