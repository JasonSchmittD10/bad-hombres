# Bad Hombres Fantasy Football — Website

Static site for the Bad Hombres league. Pure HTML, no build step, no dependencies.

## Structure
- `index.html` — homepage (season status, featured recap, power rankings, The Booth)
- `members/`, `bylaws/`, `record/` — league pages
- `story/` — articles (draft-recap + season stories)

## The header
Every page shares one header: the bar, the Week N crawl under it, four menus (Season, The Booth,
The Hombres, Record Book), the Make your pick button, and on phones a tab bar and a More sheet.
- Markup: `scripts/header.py` writes the same block into every page (between `<!-- bh:header -->`
  markers). Change the markup there and rerun it; `scripts/header.py check` says if a page is behind.
- Behaviour: `assets/js/nav.js` fills it from the data files (week, voices, odds, record, season,
  chokes, history, stories), so a new week never touches the pages. Who still owes a punishment,
  and the 2020 champion, are kept by hand at the top of that file.
- Styles: `assets/css/nav.css`.
- Story list: `data/stories.json`, written by `scripts/stories.py` (publish-story.py runs it).

## Hosting (Vercel)
Zero-config static site. Import this repo into Vercel and deploy — no build command, no framework preset needed. Every push to `main` auto-deploys.

## Editing
Each page is a single self-contained HTML file (styles, scripts, and images inlined). Edit the file, commit, and Vercel redeploys automatically.

Live at https://bad-hombres.vercel.app - updated via automated commits.
