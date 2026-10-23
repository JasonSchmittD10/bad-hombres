# Bad Hombres Fantasy Football — Website

Static site for the Bad Hombres league. Pure HTML, no build step, no dependencies.

## Structure
- `index.html` — homepage: the jumbotron (see below)
- `members/`, `bylaws/`, `record/` — league pages
- `story/` — articles (draft-recap + season stories)

## The header
Every page shares one header: the bar, the Week N crawl under it, four menus (Season, The Booth,
The Hombres, Record Book), the Make your pick button (it counts down to the week's first kickoff,
when picks lock, the same rule as /api/picks), and on phones a tab bar and a More sheet.
- Markup: `scripts/header.py` writes the same block into every page (between `<!-- bh:header -->`
  markers). Change the markup there and rerun it; `scripts/header.py check` says if a page is behind.
- Behaviour: `assets/js/nav.js` fills it from the data files (week, voices, odds, record, season,
  chokes, history, stories), so a new week never touches the pages. Who still owes a punishment,
  and the 2020 champion, are kept by hand at the top of that file.
- Styles: `assets/css/nav.css`.
- Story list: `data/stories.json`, written by `scripts/stories.py` (publish-story.py runs it).

## The homepage
A jumbotron for the week, built in the browser from the data files — `index.html` is only the
shell (header, eight empty sections, footer) plus three inline data blocks.
- Sections, top to bottom: the hero (the Game of the Week: picks open on Thursday, live once
  games start, the recap and the week's awards once it's final), the Scoreboard, On the line
  (Beer Mile Watch, The Bubble, the week's bonus), Standings with Power Lines, the Bonus Board
  (weekly 2×7, or the season races), the Hombres, and the Booth.
- Behaviour: `assets/js/home.js` (reads week, voices, season, odds, record, history, stories and
  home from `data/`, and `/api/scoreboard`, `/api/pulse` and `/api/picks` live). Styles:
  `assets/css/home.css`.
- The one-liners (the hero's title and line, the next-kickoff card, the On the line footers)
  are `data/home.json`, written each week with `scripts/home.py`. Every one is optional and
  can expire, so a missing or stale line just hides.
- Face tiles use `assets/members/cutout/` — `scripts/optimize-svg.py` makes one with every
  member illustration.
- Inline in `index.html`: `BH_AWARD_WINNERS` (one line — scripts read it with a regex),
  `BH_BONUSES`, `BH_SEASON_AWARDS`, and the Booth's featured story (only
  `scripts/publish-story.py` writes it).
- What each section reads and which routine keeps it current: `scripts/UPDATE_WEEK.md`,
  "The homepage".

## Hosting (Vercel)
Zero-config static site. Import this repo into Vercel and deploy — no build command, no framework preset needed. Every push to `main` auto-deploys.

## Editing
Each page is a single self-contained HTML file (styles, scripts, and images inlined). Edit the file, commit, and Vercel redeploys automatically.

Live at https://bad-hombres.vercel.app - updated via automated commits.
