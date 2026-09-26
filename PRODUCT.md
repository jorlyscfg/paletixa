# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The public landing serves final consumers discovering products and businesses exploring La Paleti'Xa's wholesale offering.

## Product Purpose

La Paleti'Xa publishes a product catalog for public browsing and keeps availability synchronized with catalog changes. This surface succeeds when every visitor understands what they can discover and finds a verifiable next step.

## Positioning

La Paleti'Xa connects public discovery of Bolis, Saborines, Paletas, Nieves, and Aguas frescas with a separate portal for wholesale customers.

## Operating Context

The brand operates in Playa del Carmen and the Riviera Maya. The public surface is browsed from mobile and desktop devices; availability can change while someone is viewing the catalog.

## Capabilities and Constraints

- The root route is a public landing and catalog.
- The public catalog reads through the safe public catalog RPC only.
- Realtime catalog updates are debounced and cleaned up on unmount.
- Visitors can search by product name, SKU, or category and filter by category.
- The existing wholesale customer portal route is `/mayoristas`.
- Administrative authentication remains at `/app`.
- Light, dark, and brand themes remain selectable; brand is the default.
- No ordering, delivery, hours, ratings, customer counts, or testimonials are claimed by this surface.

## Brand Commitments

The name is La Paleti'Xa. Visible copy is Spanish. The brand personality is colorful and playful while remaining direct and trustworthy. The supplied location, phone number, social URLs, product categories, and local product imagery are factual commitments.

## Evidence on Hand

- Local authored product imagery lives under `imagenes/`.
- Verified public facts include Playa del Carmen/Riviera Maya, fabricantes/distribuidores, and phone `9842047347`.
- The three supplied social URLs are preserved exactly in the public landing.
- There are no verified testimonials, ratings, customer counts, pricing promises, delivery promises, or business hours for this surface.

## Product Principles

- Show the actual public catalog before asking visitors to navigate elsewhere.
- Give consumers and wholesale explorers distinct, honest paths.
- Treat live availability as observable product behavior, not a marketing claim.
- Keep every action recoverable when the catalog is loading, empty, filtered, or unavailable.

## Accessibility & Inclusion

The landing must support a 320px minimum viewport, keyboard focus, semantic headings and landmarks, touch-safe controls, intentional horizontal category scrolling only, reserved image space, and reduced-motion preferences.
