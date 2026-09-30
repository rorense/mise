---
name: Mise en
description: A calm, well-made kitchen tool for a private recipe library; photos lead and the bench comes first.
colors:
  background: "#FAF8F5"
  surface: "#FFFFFF"
  surface-muted: "#F1ECE5"
  border: "#E6E1D9"
  border-strong: "#D5CEC3"
  text-primary: "#1A1A1A"
  text-secondary: "#6B6B6B"
  primary: "#B05426"
  on-primary-fill: "#FFFFFF"
  primary-soft: "#F6E6DA"
  on-primary-soft: "#8F4419"
  destructive: "#D93025"
  destructive-soft: "#FBE6E4"
  scrim: "rgba(0, 0, 0, 0.45)"
  image-chrome: "rgba(0, 0, 0, 0.45)"
  on-image: "#FFFFFF"
  star: "#F2B138"
  flame: "#FF9F1C"
  dark-background: "#121211"
  dark-surface: "#1E1E1C"
  dark-surface-muted: "#2A2A26"
  dark-border: "#33322E"
  dark-border-strong: "#474540"
  dark-text-primary: "#F2F0EC"
  dark-text-secondary: "#A8A7A2"
  dark-primary: "#E59254"
  dark-on-primary-fill: "#23150A"
  dark-primary-soft: "#3A2718"
  dark-on-primary-soft: "#F0B183"
  dark-destructive: "#F28E86"
  dark-on-destructive-fill: "#2A0F0C"
  dark-destructive-soft: "#3A1C19"
typography:
  display:
    fontFamily: "Archivo, sans-serif"
    fontSize: "34px"
    fontWeight: 600
    lineHeight: "40px"
    letterSpacing: "-1.3px"
  title:
    fontFamily: "Archivo, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: "32px"
    letterSpacing: "-0.9px"
  heading:
    fontFamily: "Archivo, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "26px"
    letterSpacing: "-0.4px"
  subheading:
    fontFamily: "Archivo, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "21px"
    letterSpacing: "-0.2px"
  body:
    fontFamily: "Archivo, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "23px"
  body-strong:
    fontFamily: "Archivo, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "23px"
  label:
    fontFamily: "Archivo, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
  button:
    fontFamily: "Archivo, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: "20px"
  caption:
    fontFamily: "Archivo, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "18px"
  caption-strong:
    fontFamily: "Archivo, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "18px"
  overline:
    fontFamily: "Archivo, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "18px"
  numeral:
    fontFamily: "Archivo, sans-serif"
    fontSize: "40px"
    fontWeight: 300
    lineHeight: "44px"
    letterSpacing: "-1.2px"
    fontFeature: "tnum"
rounded:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "20px"
  xl: "28px"
  pill: "999px"
spacing:
  xxs: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
  xxxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary-fill}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "12px 16px"
    height: "48px"
  button-primary-lg:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary-fill}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "12px 20px"
    height: "56px"
  button-secondary:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "12px 16px"
    height: "48px"
  button-ghost:
    textColor: "{colors.primary}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "12px 16px"
    height: "48px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.on-primary-fill}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "12px 16px"
    height: "48px"
  cook-step-button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary-fill}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    height: "64px"
  icon-button-surface:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.pill}"
    size: "40px"
  icon-button-accent:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.on-primary-soft}"
    rounded: "{rounded.pill}"
    size: "40px"
  icon-button-on-image:
    backgroundColor: "{colors.image-chrome}"
    textColor: "{colors.on-image}"
    rounded: "{rounded.pill}"
    size: "40px"
  chip:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text-primary}"
    typography: "{typography.caption-strong}"
    rounded: "{rounded.pill}"
    padding: "8px 12px"
    height: "36px"
  chip-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.on-primary-soft}"
    typography: "{typography.caption-strong}"
    rounded: "{rounded.pill}"
    padding: "8px 12px"
    height: "36px"
  segmented-track:
    backgroundColor: "{colors.surface-muted}"
    rounded: "{rounded.pill}"
    padding: "4px"
  segmented-option-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "40px"
  segmented-option:
    textColor: "{colors.text-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "40px"
  text-field:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "12px 16px"
  text-field-multiline:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 12px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "16px"
  modal-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "16px"
  photo-tile:
    backgroundColor: "{colors.surface-muted}"
    rounded: "{rounded.lg}"
  fab-extended:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary-fill}"
    typography: "{typography.button}"
    rounded: "{rounded.lg}"
    padding: "0 20px 0 16px"
    height: "56px"
  servings-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    typography: "{typography.numeral}"
    rounded: "{rounded.pill}"
    padding: "8px 8px 8px 20px"
---

# Design System: Mise en

## Overview

**Creative North Star: "The Bench Appliance"**

Mise en is a kitchen tool that knows it will be used with wet hands at arm's length. The system is built so a screen has few controls, each one obvious: pill-shaped, tonal and big enough to hit with a knuckle. The user's own food photos carry the colour and the mood; the chrome around them stays quiet cream, white and warm grey with a single clay accent.

Hierarchy comes from one grotesk, Archivo, used at different weights and sizes, never from a second face or decorative labels. Large figures (servings, timers, the day of a cook) are set in a light, tabular numeral so they read like the display on a good appliance. Surfaces are flat and tonal: sunken fields and tracks in `surface-muted`, raised cards in white with a soft shadow in light mode, and hairline borders in dark mode, where a shadow cannot render.

Light and dark are both first-class. Every foreground/background pair is chosen to clear WCAG AA in both modes, which is why filled controls use dedicated `on-*` text colours rather than white.

**Key Characteristics:**
- Photos lead; titles sit below tiles, or on a graded scrim when they must sit on the photo.
- One accent (clay), used for primary actions, active states and progress.
- Pills everywhere a finger lands; 20/28 radii for containers and sheets.
- Flat tonal layering; shadow only in light mode and only at three levels.
- 48dp minimum targets, 64dp in cooking mode.

## Colors

A warm neutral ground with a single clay accent; everything else is tone.

### Primary
- **Clay** (`primary`): filled primary buttons, the extended "Add recipe" FAB, focus outlines on fields, the current step in cooking progress, the lit ticks of the timer ring, and the want-to-cook flame when it sits on a surface. In dark mode it lightens to **Ember** (`dark-primary`) and filled controls switch to dark text (`dark-on-primary-fill`).
- **Clay Tint** (`primary-soft`) with **Deep Clay** text (`on-primary-soft`): selected chips, selected menu rows, step-number badges, the accent icon button, the running-timer pill and the cook-suggestion panel.

### Neutral
- **Cream** (`background`): the page ground on every screen and the body sheet laid over the recipe photo.
- **White** (`surface`): cards, dialogs, the servings bar, the selected segment, pinned footers.
- **Oat** (`surface-muted`): the sunken layer. Text fields, segmented-control tracks, secondary buttons, idle chips, surface icon buttons, and photo placeholders.
- **Linen Line** (`border`) and **Stone Line** (`border-strong`): hairlines on dark-mode cards and dialogs, footer rules, completed-step segments and unrated stars.
- **Ink** (`text-primary`) and **Graphite** (`text-secondary`): body text and supporting text (counts, captions, placeholders, inactive segments).

### Semantic
- **Signal Red** (`destructive`, `destructive-soft`): destructive buttons, field errors and the stop-timer backing.
- **Honey** (`star`): favourite stars and ratings. Same value in both modes.
- **Flame** (`flame`): the want-to-cook flame where it sits on photo chrome (the lead card badge). Same value in both modes.
- **Photo chrome** (`scrim`, `image-chrome`, `on-image`): dialog backdrop, the dark circle behind icons that float on a photo, and white text over a photo.

### Named Rules
**The One Accent Rule.** Clay is the only hue in the chrome. Star and flame are markers, not accents; they never fill a control or a surface.

**The On-Token Rule.** Text on any fill uses its paired `on-*` token (`on-primary-fill`, `on-primary-soft`, `dark-on-destructive-fill`), never a literal white. White on the dark-mode accent is 3.2:1 and fails.

**The Theme-Only Hex Rule.** Colour values live in `theme/colors.ts` and nowhere else; screens reference tokens.

## Typography

**Display Font:** Archivo (weights 300, 400, 500, 600, 700 loaded)
**Body Font:** Archivo
**Label/Mono Font:** Archivo; the light cut with tabular figures serves as the numeral face.

**Character:** A single sturdy grotesk with tight negative tracking at large sizes and plain tracking at reading sizes. It reads as engineered rather than editorial.

### Hierarchy
- **Display** (600, 34/40, -1.3): the "Mise en" title on the library home only.
- **Title** (600, 28/32, -0.9): screen titles, the recipe title, and the current instruction in cooking mode.
- **Heading** (600, 20/26, -0.4): section and dialog headings, the lead card title over its photo.
- **Subheading** (600, 16/21, -0.2): photo-tile titles, card and list-row titles.
- **Body / Body Strong** (400 / 600, 16/23): recipe text, ingredient names and quantities, step instructions.
- **Label** (500, 14/20): field labels and segmented-control options (selected option steps up to 600).
- **Button** (600, 15/20): button and FAB labels.
- **Caption / Caption Strong** (400 / 500, 13/18): counts, sort line, meta lines under tiles, chip labels, step badges.
- **Overline** (500, 13/18, sentence case): a group label above a block of content, such as an ingredient group ("For the sauce"). Never uppercase.
- **Numeral** (300, 40/44, -1.2, tabular): servings count, timer readouts, journal day-of-month.

### Named Rules
**The One Grotesk Rule.** Archivo is the only face. Hierarchy comes from weight and size; do not add a serif, a mono or a system display face.

**The Light Numeral Rule.** A number that the cook reads at a glance is set in `numeral`: light weight, tabular figures, so it does not jitter as it counts down. Nothing that is not a number uses this style.

**The Role-Not-Size Rule.** Text is set through the `Text` component by role (`variant` + `tone`). No raw `fontSize` or `fontFamily` outside `theme/`.

## Layout

A single-column phone layout on a 4pt spacing scale (2, 4, 8, 12, 16, 20, 24, 32). Screen gutters are 16 on the library, recipe body and cooking mode, and 20 on screens built with the shared `Screen` shell. Direct children of a screen body are spaced 16 apart.

The library stacks a display title with a settings button, a full-width pill search, a segmented quick-filter switch beside a more-filters button, a count/sort line, a full-width lead photo card (216 tall), then a 2-column grid of square photo tiles with a 12 gap and titles underneath (a list view swaps to full-width 16:10 tiles). An extended FAB sits bottom-right, 16 above the safe area; list content pads its bottom to clear it.

The recipe screen runs a 300-tall hero photo edge to edge, with the cream body sheet pulled up over it by the 28 radius. Floating icon buttons ride over the photo's top scrim. Below the title come meta pills, tags, the servings bar, a segmented switch between sections, and the section content. Cooking mode is one step per screen: a thin segmented progress rail, the instruction at title size, an optional timer ring, and a bottom dock of two 64-tall buttons (Back takes one part, Next takes two).

**The Spacing-Scale Rule.** Padding, margin and gap always come from the `space` scale. Component dimensions (photo heights, ring size) may be fixed numbers; spacing may not.

## Elevation & Depth

A hybrid system with flat tonal layering as the default. The page is cream, sunken controls are oat, and raised things are white. In light mode, raised things also carry a soft shadow at one of three levels. In dark mode the shadow is dropped (only Android's z-order `elevation` remains), and raised surfaces take a 1px `border` hairline instead.

### Shadow Vocabulary
- **Level 1** (Android elevation 1; elsewhere 0 1px 3px at 6% black): resting cards, the selected segment, the servings bar.
- **Level 2** (elevation 3; 0 2px 8px at 9%): available on cards; not used by the shipped screens.
- **Level 3** (elevation 6; 0 4px 16px at 14%): things that float above content, such as FABs, the active-timer bar and dialogs.

### Named Rules
**The Elevation-Helper Rule.** Depth is set only through `elevation(level, mode)`. Never set `shadowOpacity` or `shadowRadius` directly: Android ignores them and dark mode must not fake depth.

**The Dark Hairline Rule.** Anything raised in light mode gets a 1px `border` in dark mode instead of a shadow.

## Shapes

Soft, generous rounding. Every control a finger lands on is a full pill (999, not 9999, which overflows on some Android GPUs): buttons, chips, icon buttons, single-line fields, segment tracks and options, the servings bar, progress segments, timer ticks and step badges. Containers use 20 (cards, photo tiles, the lead card, dialogs, the suggestion panel, the active-timer bar, FABs). The recipe body sheet over its photo uses 28 on its top corners. Multiline fields and menu rows use 14. The 4 radius is reserved for the squared corner of a chat bubble.

Photos are always clipped to their container's radius. Borders are 1px and appear only in dark mode, on outlined level-0 cards, or as a field's focus/error ring.

## Components

### Buttons
Tactile, plain and wide: a pill with a semibold label and an optional leading icon.
- **Shape:** full pill (`rounded.pill`); 48 tall by default, 56 for `lg`, 64 in the cooking dock.
- **Primary:** clay fill with `on-primary-fill` text, 16 horizontal padding (20 for `lg`).
- **Secondary:** oat fill with ink text. The second action beside a primary one (Ignore, Back, Pause/Stop).
- **Ghost:** no fill, clay text.
- **Destructive:** red fill with its `on-destructive-fill` text.
- **Press:** Android ripple (`ripple` on surfaces, `ripple-on-fill` on filled buttons); a 0.72 opacity dim elsewhere. Disabled and loading drop to 0.45 opacity; loading swaps the label for a spinner.

### Icon Buttons
- **Shape:** circle, 40 by default, 48 for primary header actions and servings steppers. The tap target is padded to 48 with `hitSlopFor` whenever the circle is smaller.
- **Variants:** surface (oat), ghost (no fill), accent (clay tint, used for "on" toggles like reading mode or active filters), on-image (translucent black circle with white icon over photos).
- **Press:** borderless ripple.

### Chips
- **Style:** oat pill, no outline, caption-strong label, optional 14 icon. 36 tall with vertical hit slop to reach 48.
- **State:** active swaps to clay tint with deep-clay text. Used for tags, filter options, the checklist toggle and timer presets.

### Segmented Control
The one-of-N switch that replaced rows of filter chips. An oat pill track with 4 padding; the selected option is raised onto a white pill with level-1 elevation and a semibold label, and the others sit in graphite. An option icon stays clay in both states. It runs the library quick filters (All / Want to cook / Favourites) and the recipe sections.

### Cards / Containers
- **Corner Style:** 20.
- **Background:** white.
- **Shadow Strategy:** level 1 by default in light mode; hairline border in dark mode (see Elevation & Depth).
- **Internal Padding:** 16, or none when a photo must bleed to the edges.
- **Tappable cards** require an accessibility label and dim to 0.85 when pressed.

### Inputs / Fields
- **Style:** oat fill, pill for single-line and 14 radius for multiline, 16 horizontal padding, body text, an optional 18 leading icon.
- **Focus:** the invisible 1px outline turns clay and the icon turns clay. The ring changes colour, never width, so text never shifts.
- **Error:** outline turns red and the helper caption below becomes the error message.

### Dialogs
A centred white card (20 radius, 16 padding, 1px border, level 3) over a black scrim at 45% (60% in dark). Tapping the backdrop closes it. Title in heading.

### Navigation
There is no tab bar. The library home is the root; other screens push on top. Headers are in the page flow: an optional surface-circle back button, a title, and right-aligned icon actions. The library uses the display title. Over a hero photo, the back and action buttons switch to the on-image variant.

### Photo Tile and Lead Card
Photos carry the library. Tiles are square in the grid and 16:10 in the list, with 20 corners and an oat placeholder with a muted restaurant icon when no photo exists. The title (subheading, up to two lines) and a caption meta line sit **below** the photo, never on it. The lead card is the one exception: the next want-to-cook recipe, full width and 216 tall, with its title in heading over an `ImageScrim` (a 4-band black ramp from 0% to 68%) and a small translucent pill holding a flame and "Want to cook".

### Servings Bar
The one big scaling control: a white pill (level 1, or hairlined in dark mode) holding "Serves" in secondary body, a 48 minus button, the count in `numeral`, and a 48 plus button.

### Timer Ring
Cooking mode's countdown: 60 pill-shaped ticks in a 216 ring (every fifth tick longer) that go out clockwise as time runs down. Lit ticks are clay while running and stone while paused; spent ticks are oat. The readout inside uses `numeral`.

### Extended FAB
"Add recipe": a 56-tall clay slab with a 20 radius (not a pill, so it reads as a different kind of object from buttons), a 24 add icon and a button label, at level 3.

## Do's and Don'ts

### Do:
- **Do** build screens from `components/ui` (`Screen`, `Button`, `IconButton`, `Card`, `Chip`, `TextField`, `SegmentedControl`, `SwitchRow`, `Text`, `ModalCard`, `Section`, `ImageScrim`) rather than hand-rolling a `Pressable` one of them covers.
- **Do** give every `Pressable` `android_ripple={ripple(...)}` plus `pressedStyle(pressed)`.
- **Do** keep every target at least 48dp, using `hitSlopFor(size)` when the control must look smaller; use 64dp (`control.xl`) for anything pressed mid-cook.
- **Do** give every interactive element an `accessibilityLabel` and `accessibilityRole`, and stateful ones `accessibilityState`.
- **Do** mark want-to-cook with the flame icon and favourites with the honey star colour.
- **Do** lay `ImageScrim` under any text placed on a photo.
- **Do** make a circle with a radius of half a known size; that is the only allowed raw radius.

### Don't:
- **Don't** use raw numbers for padding, margin, gap, `borderRadius` or `fontSize`, or hex literals outside `theme/`.
- **Don't** set `shadowOpacity` or `shadowRadius` directly; use `elevation(level, mode)`.
- **Don't** put white text on a filled control; use the matching `on-*` token.
- **Don't** set overlines or labels in uppercase; the overline is sentence case.
- **Don't** bring back rows of filter chips or collapsible sections as primary navigation; use one segmented switch plus a more-filters button.
- **Don't** put tile titles on the photo; only the lead card does that, over a scrim.
