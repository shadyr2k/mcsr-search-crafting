# Responsive layout contract

The layout must work throughout the supported viewport range, rather than only
at named device sizes. Preserve the existing panel styling and desktop structure;
fix intrinsic sizing and containment before adding responsive transitions.

## Invariants

- The document has no horizontal scrolling from 320px through 2560px.
- Major sibling panels do not overlap. Visible content and controls stay inside
  their owning panel unless they belong to an intentional overlay or local scroll
  region described below.
- Grid and flex children can shrink. Use `min-width: 0`, zero-minimum fractional
  tracks, and bounded images/inputs where intrinsic content would otherwise set
  the panel width. Long text must wrap or use an intentional text-only ellipsis.
- Controls remain reachable and usable. `overflow: hidden` is not a substitute
  for fitting buttons, fields, images, or substantive panel content.
- Lookup Setup and Edit Item Set share their item pickers, rules, preset chips,
  saved-inventory controls, section spacing, and action styles. Item searches
  appear from a compact + button, allow multiple additions, and dismiss with
  Escape or an outside click. Open pickers participate in document flow;
  their item lists scroll vertically within a bounded height. Outside clicks
  finish before an inline picker collapses, preserving the clicked action.
  The recipe simulator uses the same + picker. Item selection and touch scrolling
  keep it open; outside taps dismiss even when momentum scrolling suppresses the
  browser's click. Compatibility clicks from removed item tiles cannot activate
  controls underneath. Focus uses a subtle field background without an outline.
- Saved inventories load from a selector, create a named save with Save as new,
  and expose inline Rename/Delete for the selected save. Update items is a
  separate explicit overwrite action. Long names and inline fields must not
  widen their panel. The existing three saved-inventory slots are preserved.
- Save/Look up crafts uses a content-sized green control; Cancel/Clear remains
  neutral and secondary, and red Delete item set sits outside the Save/Cancel group.
- Results use a plain section header with the full English/native language name,
  secondary navigation actions, a smaller Results label, and a bottom divider.
  Its action group wraps below the heading when their combined intrinsic widths
  no longer fit the results column; it must not squeeze the heading to stay beside it.
  The heading, navigation actions, and Results label all retain the Coiny title font.
- Populated craft-lookup summaries reserve separate grid cells for the
  language, craft previews, score, and disclosure button. At 42rem and below,
  the previews and score move below the language, while the disclosure spans
  both rows. Preview chips yield as whole
  chips when space runs out; they cannot overlap the disclosure or clip query text.
- Expanded result cards put the number crafts display choice in a toolbar above
  both columns. Each category keeps its independent Junkless/Other choice.
  Heading/control rows wrap when needed; adjacent segments share one border,
  consistent height, and a filled selected state.
- Header title and tagline form a content-sized vertical stack with a 2–4px
  gap at the default font size. Heading lines stay compact, and the logo remains
  beside and vertically centered against the combined text block.
  Each text line stays unwrapped: navigation moves below the branding at 96rem,
  and the controls move to their own row at 56rem.
- The home workspace remains three columns above 72rem, craft lookup remains
  two columns above 72rem, and the recipe simulator's outer layout remains two
  columns above 56rem. Their sections stack at those intentional boundaries.
- The dedicated crafting sheet remains three panes when width exceeds 72rem
  and height exceeds 54rem; either smaller dimension switches it to a vertical
  page. Compact mode must obey the same responsive rules as normal mode.
- Comparison setup and results stay side by side above 70rem. Language 1 and
  Language 2 selectors share a row until 34rem; Compare sits below them. The
  calculated overall comparison sits below Compare in the setup column, with
  the best bound, both selected-language scores, and worst bound stacked vertically.
  The Compare languages heading and separate Back to crafts button share a row
  within that first column. The language-pair heading, item sets, and item-set
  scores belong to the results column.
- Keyboard playback derives its proportions from square standard keys in six
  rows on a 16-unit board. Wider keys span proportional units, including their
  internal spacing; shorter rows distribute spare space between keys. The mouse
  keeps its 0.7:1 aspect ratio. The complete diagram is capped at 42rem, aligns
  left, and leaves extra space on the right. Key spacing and labels scale with it.
- Crafting-sheet Back to crafts and Reset sheet share one action row. Both
  use the title font. Other action buttons use the segmented controls' Figtree
  typography; page navigation retains Coiny and the top menu is unchanged.
- Sheet and comparison disclosures retain their content through the closing
  fade, make it inert immediately, then remove it. Reduced-motion preferences
  bypass the transition; reopening during a close keeps the content available.
- Content may wrap within a panel as its available width changes. Major layout
  transitions occur at the documented viewport or container boundaries.

## Audit findings

The audit covers `web/src/App.css`, the component styles, and the immediate
component layout/measurement code. The important risk patterns were:

- Hard minimum grid tracks and fixed controls competing with flexible text.
- Implicit grid tracks and flex/grid children retaining `min-width: auto`.
- Nested `nowrap` previews and labels whose bounds depended on viewport width
  instead of their owning panel's available space.
- Percentage-width keyboard pieces without explicit shrinkable children.
- Mobile crafting cost text using `width: 100%` plus an additional margin.
- A compact comparison selector with enough specificity to override its mobile
  two-column rule.
- Repeated media-query overrides, including redundant comparison stacking rules,
  making the effective layout depend on cascade order.
- Viewport-height-limited dropdowns that still need tests near their anchor and
  the bottom of a short viewport.
- Desktop crafting totals occupying a much narrower panel than the viewport;
  viewport size alone cannot prove that these cells fit.

The fixes preserve panel styling and the existing breakpoints. Workspace tracks,
settings, and keyboard children can shrink; preset/settings text wraps; images,
inputs, and item-picker menus are bounded by their available width. Mobile cost
text accounts for its margin, and compact comparison respects its mobile rule.
Craft targets shrink proportionally when needed. A junk preview that cannot fit
even its aggregate count yields to the expanded detail, where every junk item
remains available. A regression test verifies that fallback by opening the row.
No resolution-specific breakpoint was added.

## Intentional breakpoints

Pixel equivalents assume the browser's initial 16px font size. `max-width`
queries include the boundary. A breakpoint can affect several independently
owned regions; this table consolidates duplicate declarations.

| Viewport width | Intended behavior at or below the boundary |
| --- | --- |
| 32rem / 512px | Crafting header/actions and disclosure labels reflow; mobile entry details tighten. |
| 34rem / 544px | Language reference groups and comparison language selectors become one column. Overall score summaries remain vertical at every width. |
| 35rem / 560px | Keyboard editor control groups become one column. |
| 36rem / 576px | Craft-result sprites may shrink fluidly within their existing ordered row. |
| 38rem / 608px | Recipe simulator header stacks; comparison previews move below the title, and selected-craft details stack. |
| 42rem / 672px | Settings number cards/cache/save sections stack; craft-result details reflow; craft-lookup previews and scores move below the language name. |
| 44rem / 704px | Inline crafting totals use two columns. |
| 47rem / 752px | Comparison item-set scores move beneath their item sets; expanded language details stack. |
| 52rem / 832px | Dedicated crafting-page totals use two columns. |
| 55rem / 880px | Craft categories and their content become one column. |
| 56rem / 896px | Header brand/navigation/menu adopt the mobile grid; simulator controls and book area stack. |
| 70rem / 1120px | Comparison setup and results become one column; language selectors remain side by side until 544px. |
| 72rem / 1152px | Main workspace and craft lookup stack; home summary rows and editor placement change; navigation becomes compact; dedicated crafting sheet stacks. |
| 75rem / 1200px | Simulator book and detail area become one column. |
| 96rem / 1536px | Header navigation moves to its own row; branding and controls remain beside each other until the mobile breakpoint. |

The header transition is based on its uncompressed content: the full desktop
row needs approximately 1510px including shell padding with the loaded fonts.
96rem leaves a small allowance before any branding compression. Previously,
at 1153px the 621px navigation and 274px controls squeezed the title wrapper to
about 25px. Its three heading lines and four tagline lines drove the header to
204px tall. Protecting the brand's intrinsic width and moving navigation to a
separate grid area keeps each text line intact without constraining height.

The crafting sheet also stacks at viewport height **54rem / 864px**, regardless
of width. The desktop height-lock rule uses `(width > 72rem) and
(height > 54rem)`, complementary to the inclusive stacking queries. This avoids
the fractional gaps left by the former 72.01rem/54.01rem thresholds.

Container queries are independent of viewport width and must be exercised with
the relevant container itself sized just below, at, and above the threshold:

| Container width | Intended behavior |
| --- | --- |
| 25rem / 400px | Craft-result rows preserve query → items → disclosure order while allocating a shrinkable item preview. |
| 30rem / 480px | Compact search summaries wrap their selected previews; overlap previews and fallback regular previews are chosen to fit. Craft lookup retains its overlap previews. |

`prefers-reduced-motion` and `any-pointer: coarse` are capability preferences,
not viewport breakpoints. Reduced motion is enabled for geometry tests so
transition frames do not masquerade as layout failures.

## Designed scrolling and overlays

The crafting sheet pages its item-set columns with Previous/Next buttons and a
page indicator. It shows two columns when its item-set region can fit two 20rem
cards plus the column gap (currently .65rem), otherwise one. This is measured
from the panel's available width, independent of viewport breakpoints. Desktop
rows are based on available height; the stacked layout uses ten entries per
column. Desktop capacity accounts for the tallest measured summary header plus
its card padding and borders, including wrapped summaries, so ordinary pages
do not need vertical scrolling. Measurements are retained per item set and
replaced when its summary changes; expanded or closing bodies never contribute
to collapsed-row capacity. Resizing recalculates the available row count.
Item-set summaries wrap within their column, and expanded editors may
scroll vertically. All entries remain reachable through paging, without a
horizontal column scrollbar. The editable keyboard deliberately retains a
620px physical layout inside `.keyboard-editor__scroll`. Constrained lists,
desktop sheet panes, suggestion menus, and the tutorial card may scroll
vertically. These scroll regions must remain bounded by their panel, and their
contents must be reachable by scrolling. They do not authorize document overflow
or an unrelated child escaping its panel.

Expanded sheet rows have an item-set name field immediately above the divider
before individual craft searches. Blur or Enter saves the name; Escape cancels,
and clearing restores the numbered default. Names persist with workspace entries,
survive editing/sharing, and appear read-only in comparison rows and their compact
navigator. Name-only edits leave calculation/cache identities and saved craft
choices intact. `item-set-names.spec.ts` verifies these browser workflows.

The pagination animation regression starts with 24 varied item sets. Before the
fix, switching expanded rows reduced a 20-entry page to two entries. The test now
checks opening, switching, closing, and resizing with animation enabled at several
desktop heights. Open sheet editors also receive the full 320–2560px width sweep
in both layout modes; vertical scrollports must stay inside their owning panels.

Language/item pickers, theme/version menus, query suggestion portals, tooltips,
the item-set editor overlay, and the tutorial are intentional overlays. Test
their viewport bounds and control reachability separately from ordinary sibling
overlap checks. Existing ellipsized labels and compact preview choices are
intentional presentation rules; clipping interactive controls is not.

## Automated coverage

`web/e2e/responsive-layout.spec.ts` runs DOM geometry checks across the main
pages: search crafting, language info, craft lookup, recipe book simulator,
settings, crafting sheet, and language comparison, plus the open item editor.
Each is swept in normal and compact mode. It waits for fonts and
layout measurements after resizing, then reports failing dimensions and DOM
elements. A small tolerance accommodates borders and fractional CSS pixels.

The sweep covers **320–2560px inclusive, in 8px steps** (281 regularly spaced
widths), at a representative height of 1000px. Every viewport breakpoint above
also receives explicit `breakpoint - 1`, `breakpoint`, and `breakpoint + 1` checks.
Height checks cover 863, 864, and 865px at widths on both sides of 1152px and at
1920px. Container boundaries require corresponding 399/400/401px and
479/480/481px container checks, rather than treating those numbers as viewport
widths. `web/e2e/responsive-containers.spec.ts` sets those exact content-box
widths in normal and compact layouts, waits for observers, and checks queries,
targets, and controls for containment and clipping. It also exercises an expanded
six-query crafting entry at mobile, short-laptop, and desktop sizes, focusing
each query field to verify reachability.

Representative dimensions cover small and standard phones, landscape mobile,
portrait/landscape tablets, short laptops, standard desktop, and large desktop:

`320×568`, `390×844`, `844×390`, `768×1024`, `1024×768`, `1280×720`,
`1366×768`, `1920×1080`, and `2560×1440`.

Geometry assertions check document overflow, panel containment, clipped controls
and images, major sibling overlap, and the expected number of desktop/stacked
columns. Local scroll regions and overlays need their own reachability checks;
excluding them from ordinary containment checks alone does not establish that
they work. `responsive-controls.spec.ts` checks menu bounds and actual selections
at representative dimensions, including a short landscape viewport. The
container tests verify that expanded query fields can be scrolled into view and
focused. The sweep also inventories CSS queries so adding an undocumented
breakpoint fails the test.

The companion `web/e2e/responsive-visual.spec.ts` keeps a small set of screenshots
at representative layouts. It must not create snapshots for every swept width.
Use those screenshots to review appearance after geometry passes, including
desktop columns and mobile stacking. Maintain visual baselines in the same
browser/platform used for verification.

Run the focused checks with:

```powershell
pnpm --dir web run e2e:responsive --workers=2
```

The width/boundary union contains 311 widths. Together with 21 representative
viewport/height cases across 16 page/mode states, the sweep checks 5,312 viewport
states. Five Chromium/Windows page baselines cover mobile, tablet, desktop,
short laptop, and the large desktop crafting sheet. Two isolated result-card
baselines cover the shared toolbar and segmented controls at 320px and 1920px.

`responsive-lookup.spec.ts` additionally populates real lookup results and checks
language/preview/score/disclosure separation, query containment, and working expansion
in normal and compact modes over the same 311 widths plus representative heights.
The sheet pagination regressions exercise both column capacities, their measured
transition, page navigation, and included/editable entries.
Run those workflow checks with `pnpm --dir web run e2e -- crafting-sheet-pagination.spec.ts`.

Craft lookup retains its two outer setup/results panels and the 72rem stacking
boundary. Shared item editors use section dividers, segmented Rules controls,
preset chips, and a saved-inventory selector with inline naming and management. Result filters
wrap intrinsically and include matching-language counts; result rows use dividers
without a second enclosing card around the scroll region. No new viewport
breakpoints were introduced. `craft-lookup-redesign.spec.ts` covers saved-inventory
loading/renaming/persistence, rules, filters, scores and expansion, and keeps just
two additional visual baselines at 390px and 1440px.
The inline saved-inventory name editor is also swept from 320–2560px in 8px steps,
with a long saved name and explicit 672px/1152px boundary neighbors. Its flex
containers use `min-width: 0` so the native select cannot widen the owning panel.

`responsive-editor.spec.ts` checks both shared editor variants in normal and
compact modes with each multi-add picker open. Each picker covers the 311 sweep
widths (320–2560px, 8px intervals and every breakpoint ±1) plus seven representative
height/width pairs. Assertions check page/picker overflow, control containment,
section separation, multi-add focus, explicit dismissal, and preset clicks while
a picker is open. Two additional editor visual baselines at 390px and 1440px
check the green primary action and separated Delete action.

Editor typography uses 1rem section headings, .95rem rule labels, and enlarged
control text with tighter line spacing and section gaps. A regression compares
the closed editor and empty lookup at 390, 768, 1440, and 1920px against their
pre-change heights; the larger text must stay within those height budgets and
preserve the Rules control heights. Existing outer height limits remain unchanged.

Shared-editor verification: all 457 unit tests, the production build, 36 broad
responsive checks, six shared-editor sweep/visual checks, and 15 affected
workflow/tutorial checks passed. The two new editor snapshots also passed a
separate comparison run. No additional viewport or container breakpoints were
introduced for this change.

Outside-tap follow-up: all 458 unit tests, the build, ten mobile interaction
checks, twenty picker/workflow/visual checks, and six affected-page sweeps pass.
Open simulator pickers now receive the same 311-width sweep and representative
heights in normal and compact modes. Phone tests cover target and inventory
pickers in both editors plus simulator inventory, repeated selections, touch
scrolling without selection, outside dismissal after scrolling, and reopening.

Redesign verification: all 36 responsive tests passed, followed by four affected
lookup/editor sweeps after the saved-name sizing correction. Four new lookup
workflow/visual tests and six shared-editor/tour regressions passed. The unit
suite covered 450 tests; the App tests passed on a focused rerun after updating
the assertion for the removed category heading. The production build passed.

Keyboard/comparison follow-up: all 463 unit tests and the production build pass.
The 45 responsive checks pass across the broad sweep and focused correction
runs. The font change required a small shared editor-gap reduction to preserve
the existing height budgets and updates to the affected representative visual
baselines. A final 28-test workflow/visual run passes, including the editor and
simulator picker sweeps, saved inventories, and sheet pagination.
The comparison sweep additionally opens item-set details, checks separation of
setup/results and both language selectors, and keeps disclosure arrows beside
their item-set headings at every swept width. Both normal and compact sweeps
pass after the arrow placement correction.

`keyboard-proportions.spec.ts` verifies board/mouse aspect ratios, the width cap,
left alignment and blank right space, plus keyboard rebinding on small screens.
It also checks every standard key for square geometry throughout 320–2560px
in 8px increments; wider keys use the same physical unit without stretching
the standard keys in shorter rows. Overall comparison belongs directly below
Compare in the first column, with a regression asserting its owning section
and vertical position.
`sheet-comparison-layout.spec.ts` samples the closing animation in the browser,
checks retained/inert content and eventual removal, and checks the common header
action row around responsive boundaries. It keeps two comparison screenshots
at 390px and 1440px. `button-typography.spec.ts` checks action/navigation fonts
across all major pages. No new viewport or container breakpoints were added.

## Baseline regression notes

Three existing browser tests fail identically on isolated `master`
(`71355df1a6d56d0da8a59dc8f3071bcfa0c556d7`):

- `app.spec.ts`: “keeps categorized language lists on the stacked normal
  language-info page” expects category DOM that the input-led picker no longer
  renders, causing `getComputedStyle(null)`.
- `crafting-sheet.spec.ts`: “crafting sheet customizes bed and anchor, persists
  choices, and fits narrow screens” expects `your sequencebedSHaw`, while the
  generated sequence is `your sequencebeSHaw`.
- `crafting-sheet.spec.ts`: “reorders Latin item crafts and automatically uses
  two backspaces for lea to lab” expects `lea`, while the plan is
  `your sequencea_a`.

Verification: all 31 new responsive tests passed (including focused reruns after
correcting the comparison track-count expectations), the updated existing craft
row regression passed, all 440 unit tests passed, and the TypeScript/production
build passed. The full browser suite is not green because of the three baseline
failures above. No generator or production-data files changed.

Cached tooltip follow-up: craft rows rebuild missing explanations on expansion
from the selected language, inventory, grid, and item-ID search setting. The
persistent cache still omits explanations. Shared numeric/attribute matches
display their matching tooltip lines instead of cycling through item names.
The cached-tooltip browser regressions exercise real English and German cache
reloads and expanded evidence containment at 320, 768, 1280, and 2560px.
Verification after this change: 446 unit tests, both cached-tooltip browser
tests, the four search-crafting/craft-lookup responsive sweeps, all five visual
baselines, and the production build passed.

Results-header/lookup/pagination follow-up: all 36 responsive checks passed,
including the populated lookup sweep in both layout modes. After refining sheet
capacity to use measured card heights, both sheet sweeps, both expanded-editor
checks, the sheet visual check, and nine affected sheet workflow tests passed.
The varied 24-entry pagination fixture reaches every entry without horizontal
or collapsed-card vertical scrolling. All 76 focused component tests passed;
the 25 sheet tests and production build passed again after the sizing correction.
