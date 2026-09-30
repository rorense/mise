# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users

Ryan and his household. A personal recipe library, not a public product. Two scenes: planning on the couch (browsing, importing, deciding what to cook) and cooking at the bench (phone propped up, hands messy, reading at arm's length).

## Product Purpose

Keep every recipe the household cooks in one private, offline library, and make each recipe better every time it is cooked. Success is reaching for Mise en instead of the original website, and the recipe on the phone drifting towards "how we actually make it".

## Positioning

The recipe is a living document shaped by the cook log: each cook is logged with notes, photo and rating, and those notes become suggested adjustments to quantities and steps, with versions kept. A plain recipe box or bookmark app cannot do that.

## Operating Context

- Import from URL, YouTube, Instagram or pasted text (AI extraction), or enter manually.
- Library: search with operators (`has:chicken no:nuts mins<30`), sort, filters (favourites, want to cook, never cooked, archived), tags and cuisine, grid or list.
- Recipe: servings scaling, ingredient checklist mode, reading mode, method with step timers, recipe-scoped cooking assistant chat, cook journal.
- Cook log: date, photo, notes, rating; drives adjustment suggestions and recipe versions.
- Local-first: SQLite on device, works offline.

## Capabilities and Constraints

- Expo SDK 54 / React Native, Android only.
- Metric units only in stored data.
- Light and dark appearance modes, both must keep working.
- UI built from `components/ui` with tokens in `theme/` (see `.cursorrules`).

## Brand Commitments

- Name: "Mise en".
- The terracotta / clay orange of the launcher icon (`#CA6342` adaptive icon background) stays part of the identity.

## Evidence on Hand

- Launcher icon: `assets/icon.png`, `assets/adaptive-icon.png`.
- Recipe content is the user's own; no testimonials or public claims exist or are needed.

## Product Principles

1. The bench comes first: anything used mid-cook must read at arm's length and work with one knuckle.
2. The cook log is the heart; the recipe improves because it was cooked.
3. Fewer controls on screen at once; depth on demand.
4. The user's own food photos are the richest material the app has.

## Accessibility & Inclusion

WCAG AA contrast in both modes; 48dp minimum touch targets; every interactive element labelled.
