# Homepage and brand intro update

The intro runs once per page load, with a 1.4s logo reveal, slogan at 1.2s,
divider at 2.3s, creator typography at 2.7s, hold at 3.8s, and exit from 4.4s
to 5.0s. React removes it at 5000ms with a second 5500ms dismiss timer.
Click, touch, Enter, Space and Escape skip it. Background controls are inert
while the intro is active, and scroll state is restored on dismissal.
Reduced-motion users see a static, skippable intro.

Homepage now has three pillar cards, six horizontal shortcuts, seven PDF
categories with five filter choices, and desktop/privacy information. All
existing tool routes are retained; additional workspaces are in an expandable
section. Multiple ID Print reuses E-Card Cutter. No native desktop installers
exist, so there are no fabricated executable downloads.

Matte surfaces, muted category accents, responsive spacing, glass navigation,
local inline icons and full creator credit share the existing theme system.
No libraries, document processing engines, storage formats or CSP rules changed.

Browser regression scenarios are in tests/browser/home-matte.spec.ts. Actual
browser verification remains blocked by this runtime's Chromium socket restriction
and the separate browser's inability to reach localhost. Automated build,
TypeScript, unit and static route/runtime audit results are reported separately.
