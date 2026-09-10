# Images

`scripts/add-image.sh <file> <slug> [width] [mode]` optimises anything —
Midjourney export, phone photo, stock download — and either drops it in
`assets/` or prints a `data:` URI to inline.

```bash
scripts/add-image.sh ~/Downloads/mj-bench.png bench-warmer 900        # -> /assets/bench-warmer.jpg
scripts/add-image.sh ~/Downloads/mj-bench.png bench-warmer 160 b64    # -> data:image/jpeg;base64,...
```

**Rule of thumb:** small and repeated (avatars, icons) → inline as base64.
Large or used on one page (article heroes, award art) → a file in `assets/`,
which the browser caches across pages.

Drop source files in `assets/incoming/` — it is git-ignored, so raw
multi-megabyte exports never land in the repo.

## Where pictures can come from

| Source | Licence | Automatable |
|---|---|---|
| **Lucide** (current bonus icons) | ISC | yes, already wired |
| **Pexels / Unsplash / Pixabay** | free for commercial use, no attribution required (Unsplash appreciates it) | yes, free API key |
| **Midjourney** | yours under their ToS, on a paid plan | no public API — export and drop in `incoming/` |
| **OpenAI / Gemini image APIs** | yours | yes, but needs a paid API key in the environment |
| **Google Images** | **no** — an index of other people's copyrighted work | n/a |

Keys, if we ever add an API source, belong in the environment or a
git-ignored `.env`, never in this repo — it is public.
