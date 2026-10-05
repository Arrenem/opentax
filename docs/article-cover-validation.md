# Article cover revision — 2026-10-05

Base: main `9e76e86ef65a736084a15ef6048beb2299c35316`, including merged PR #5.

## Scope

- Keep the approved `freee-cost-review` thumbnail.
- Replace the other 54 diagram thumbnails with photographic covers and two-line headlines.
- Use five licensed photo themes, not one photograph for every article.
- Match list/category/related-card images, OG/Twitter metadata and Article.image.
- Preserve every article body and in-article guide diagram, URL, publication gate, Mock, GA and Privacy.
- Keep IDs 57/58 as drafts; this change does not approve their publication.

## Verified

- 54 JPEG files: 1200 × 630, unique, each below 150KB; registered provenance and pinned original photographs.
- Deterministic cover regeneration with `python3 scripts/site/generate-article-covers.py --check`.
- Pixel-measured font bounds and glyph availability for all headlines; no cropped/truncated text in the 16:9 contact-sheet rendering of all 54 covers.
- Visual review of all five original photographs, full-size representative covers and all 54 covers at approximately phone-card size.
- Site suite: 35 tests. CI/release verifier suite: 6 tests. Application: 108 tests. MCP: 6 tests. ESLint, TypeScript and the Next.js production build passed.
- All 53 published article pages, six categories, local links and image references pass the production build checks; both held draft pages/assets are excluded.
- All 55 Markdown bodies, 54 guide.svg files and PR #5 CI files are byte-identical to the verified main snapshot. Only cover-related article metadata changed; the benchmark record is identical.

## Browser verification status

The cloud shell's installed Chromium could not start because its socket operation
was not permitted, including after the supported sandbox escalation. It was not
bypassed. Static image rendering is verified separately from interactive browser
QA. A noindex, analytics-disabled 55-article preview build is prepared for a
permitted browser preview route. Desktop/mobile page screenshots remain a
separate check until that route has been exercised.

No merge or production deployment is included in this change.
