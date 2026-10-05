# Article image sources

## freee-cost-review

- Local asset: `site/article-assets/freee-cost-review/calculator.jpg`
- Photographer: Aaron Lefler (photo page JSON-LD `author` / `creditText`).
- Photo: https://unsplash.com/photos/a-calculator-sitting-on-top-of-a-piece-of-paper-ySZdYkPGEbs
- License: https://unsplash.com/license
- Verified and acquired: 2026-10-02. The individual photo page identifies this image as free under the Unsplash License; this is not Unsplash+.
- Download source: `https://images.unsplash.com/photo-1648201188793-418f2b9b4b32?auto=format&fit=crop&w=1400&q=82`
- Use: card cover with a short article title; in-article explanation of comparing a short monthly subscription's total cost. No person, actual user account, or freee UI is depicted. The photo illustrates calculation, not product functionality.
- Visible attribution is omitted after rechecking https://unsplash.com/license on 2026-10-02: attribution is not required. The credit, license, acquisition date and download source remain in this internal asset record and the manifest. The archive includes the local image and makes no request to Unsplash at page load.

No freee advertising material or official UI screenshot is included. Permission for such material has not been established.

## OpenTax product demo capture

- Local asset: `site/article-assets/freee-cost-review/opentax-demo.png` (1072 × 567).
- Source: https://opentax.fragmentware.com/ , acquired 2026-10-02.
- Captured the actual public LP `[data-demo]` in bank-statement scene 0, using reduced-motion preference to settle the existing animation. No synthetic UI was drawn; no screenshot text was edited. Analytics script and collection requests were blocked during capture.
- Rights/source: OpenTax's own LP in this repository; AGPL-3.0 source at https://github.com/Arrenem/opentax/blob/main/LICENSE . The user explicitly requested use of their own LP screenshot.
- Purpose: show an AI request alongside the pending journal review. The visible caption identifies the data as demo transactions; no personal accounts or actual customer books are depicted.

## Photo covers for all articles (2026-10-05)

The approved `freee-cost-review` card is unchanged. The other 54 articles now
use the same restrained photographic direction: one short two-line headline,
black type, a pale gradient and a small category caption. Body comparison
figures remain unchanged inside the articles. There are five photo themes:
calculator (pricing and reconciliation), white laptop desk (software choices),
files (migration and storage), paperwork (bookkeeping and tax preparation),
and hands at a laptop (AI-assisted work). These are illustrative stock photos,
not product screenshots, performance evidence or endorsements.

Full source records, download URLs, license URLs, acquisition dates and pinned
SHA-256 hashes are in `content/articles/cover-photos.json`. The four newly
acquired photographs are stored unchanged in `content/articles/cover-photos/`.
The existing Aaron Lefler calculator photograph is reused from its original
path. All four new source pages identify the images as free Unsplash License
photos, not Unsplash+. The individual pages and https://unsplash.com/license
were checked on 2026-10-05; commercial use and modification are permitted, and
visible attribution is optional. Credit is retained in the asset manifests.

- JESHOOTS.COM: https://unsplash.com/photos/an-open-empty-notebook-on-a-white-desk-next-to-an-iphone-and-a-macbook-pUAM5hPaCRI
- Wesley Tingey: https://unsplash.com/photos/stacks-of-paper-documents-and-file-folders-snNHKZ-mGfE
- Cht Gsml: https://unsplash.com/photos/desk-with-papers-glasses-calculator-and-office-supplies-sW02MHv37yk
- Christin Hume: https://unsplash.com/photos/person-using-laptop-computer-Hcfwew744z4

### Reproduction and checks

Edit the explicit two-line headlines/photo choices in `content/articles/covers.json`.
Run `python3 scripts/site/generate-article-covers.py` after `npm ci`, with
fontTools installed. The generator builds a code-native SVG template using
checked-in Noto Sans JP glyph paths, then rasterizes it with sharp/libvips.
It verifies source hashes, glyph availability, two lines and pixel-measured
safe margins, and writes JPEG covers plus synchronized list/OG/Article.image
metadata. `--check` verifies byte-for-byte reproducibility without changing
files. The body-diagram generator preserves these covers when it is rerun.

Covers are 1200 × 630. List cards use the baseline's 16:9 frame with centered
object-fit cover: this removes 40 pixels on each side. Text starts at x=80 and
ends at x≤1120, leaving another 40px safe inset. No ellipsis, line clamp or font
shrinking is used inside the cover. JPEG quality 86 with 4:4:4 chroma preserves
text edges while keeping each article cover below 150KB. No external image
requests are made at page load.

All 55 articles were checked: the benchmark is retained and 54 covers are
replaced, including the two held drafts. The existing publication state remains
53 published / 2 draft. Production still excludes the held articles and their
private assets. All 55 Markdown bodies, 54 body SVGs, publication fields,
benchmark metadata, Mock/GA/Privacy and the PR #5 verifier remain unchanged.
