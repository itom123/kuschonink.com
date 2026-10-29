# Migration from Squarespace

> The site has since been redesigned as *the house* (see the README). The old
> URLs `/image/<slug>`, `/about` and `/contact` still work, in the simple view.

Migrated on 29 October 2026 by crawling the live site (https://kuschonink.com).

## What was migrated

**Pages (17 routes, same URLs as before)**

- `/` and `/image`: project index over the archive background image (now: `/` is the house façade, `/image` the simple view)
- `/about`: biography and *Selected Conferences, Exhibitions & Programs*
- `/contact`: email, phone, contact form, closing banner
- 13 projects under `/image/…`: Failure of Memory, Dissecting Memories,
  Eternal Return, It Says Forget, An Entangled Past, 入森 (Into the Woods),
  Anterior Future, À Suivre, Farewell and Resurrection, Fragmented Ocean,
  Gestalt Lost in Time, Hanabi, Sisyphus Flower

**Content**

- All text, checked automatically against the live pages: every visible
  string was carried over. Only Squarespace UI labels such as "Slide 1" and
  "Previous/Next" are not copied; the new site generates its own.
- All external links (exhibitions, galleries, RCA, etc.).
- Text styling hints: large "display" titles, large text, centred and
  right-aligned text, the red accent colour (`#cb1b45`) and highlighted text.
- 129 images, all of them, including section backgrounds, galleries and
  full-screen banners, with focal points and overlay strengths.
- 5 YouTube videos, the scrolling text (marquee) on *An Entangled Past*.
- Gallery types: slideshow, reel, full-screen slideshow, masonry, strips.
- SEO titles and descriptions per page, social-share images.
- Contact form fields (Name, Email, Subject, Message) and the thank-you message.

## Image resolution

Squarespace only serves images up to **2500 px** wide, so that is the size
downloaded, at the best quality Squarespace offers (`?format=original`).
Many originals were uploaded larger (up to 10,350 px). If you have the original
files, replace the images in `src/assets/images/` with the same file names.

Images that were already under 1600 px on Squarespace (so higher-resolution
versions would help most):

- `projects/hanabi/`: drown, flux, hair, burst, palm, sunspot, handwriting,
  hurricane, resentment (1500 × 1500)
- `projects/a-suivre/20201225-haiku.jpg` (900 × 1125)
- `projects/an-entangled-past/an-entangled-past-detail-1/2/3.jpg` (≈ 600–1000 px)
- `projects/gestalt-lost-in-time/`: `00004422-ocean-7-54.jpg`,
  `00004422-wood-2.jpg`, `54-lushangdeguanghui.jpg` (≈ 1000–1550 px)
- `home/project-of-failure-2-3-of-17-extra-s.jpg` (social-share image, 1000 × 1334)

## Intentionally left out / changed

- **Article section** (`/article/…`, 16 posts incl. *Manifesto*, *How to Read a
  Failure*, *Like a Spoon of Sugar*): hidden on the live site (returns "not
  found"), skipped for now by request.
- **Contact form delivery:** Squarespace handled submissions (with reCAPTCHA).
  The new form opens the visitor's email app with the message filled in. A
  Worker endpoint can be added later to receive submissions directly.
- **Free-form layouts:** Squarespace's drag-and-drop layouts (overlapping images
  and text) are rendered as simple stacked sections, since a redesign is planned.
- **Squarespace extras:** cart, analytics (Google Tag Manager), Squarespace
  scripts and the default favicon.
