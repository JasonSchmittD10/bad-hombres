# Bad Hombres Fantasy Football — Website

Static site for the Bad Hombres league. Pure HTML, no build step, no dependencies.

## Structure
- `index.html` — homepage (season status, featured recap, power rankings, The Booth)
- `members/`, `bylaws/`, `record/` — league pages
- `story/` — articles (draft-recap + season stories)

## Hosting (Vercel)
Zero-config static site. Import this repo into Vercel and deploy — no build command, no framework preset needed. Every push to `main` auto-deploys.

## Editing
Each page is a single self-contained HTML file (styles, scripts, and images inlined). Edit the file, commit, and Vercel redeploys automatically.

Live at https://bad-hombres.vercel.app - updated via automated commits.
