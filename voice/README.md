# Voice reference — sportswriter dialect repos

> **`../VOICE_GUIDE.md` is the authoritative league doc.** It fixes the recap running
> order and the per-post voice assignments. These repos are the source material behind
> it: identity, section skeletons, sentence mechanics and prompt kits per writer. Where
> the two disagree — notably `BLENDING.md` §5, which proposes a 13-section Berry-primary
> weekly skeleton — **VOICE_GUIDE.md wins.**


Voice/tone/prose reference for four sportswriters whose registers inform league wrap-ups, previews, awards, and memos. Built Sept 10, 2026.

## Layout

```
voice/
├── README.md                    ← this file
├── BLENDING.md                  ← voice matrix, content→voice map, blending rules
├── peter-king/
│   ├── 01-profile.md            ← identity, traits, thermostat, status
│   ├── 02-architecture.md       ← fixed sections in order, templates
│   ├── 03-dialect.md            ← rhythm, signature moves, vocabulary, humor engine, do-nots
│   ├── 04-league-adaptation.md  ← section ports, member fit, worked samples in league register
│   ├── 05-prompt-kit.md         ← rules, paste-ready prompt, QA checklist, reference reads
│   ├── 06-tape-study.md         ← real pieces broken down beat by beat, corrections to 01–05, sources
│   └── 07-phrasebook.md         ← the working kit: frames with original examples, words by job, traps, do-not-use
├── drew-magary/                 (same 7 files)
├── matthew-berry/               (same 7 files)
├── scott-van-pelt/              (same 7 files)
└── stephen-a-smith/             (same 7 files; Mike Hunt's register since Oct 2026)
```

**06 and 07 were added Oct 23, 2026** from new research: tape studies of real columns and
segments (transcripts, recaps and reviews; no video), with every description paraphrased and
every example original. They were written after the October reset, so where they disagree
with 01–05, they win — and the reset in `../VOICE_GUIDE.md` outranks all of it.

## Which file to open

| You want… | Open |
|---|---|
| The league's fixed running order and post-type assignments | `../VOICE_GUIDE.md` (authoritative) |
| Which beat writer carries which voice (Mike Hunt, Wolf Blitzed, Scott Van Pelvis) | `../VOICE_GUIDE.md`, "The masthead" · `../data/masthead.json` |
| Who each writer is — history, opinions, notebook, how he works | `../.claude/agents/<writer>.md` · `../VOICE_GUIDE.md`, "The staff" |
| To decide which voice to use for a given post | `BLENDING.md` §2 |
| The section skeleton for a voice | `<writer>/02-architecture.md` |
| To fix a draft that "sounds off" | `<writer>/03-dialect.md` — check "what he does NOT do" |
| A worked example in league register | `<writer>/04-league-adaptation.md` |
| To prompt Claude to draft in a voice | `<writer>/05-prompt-kit.md` — paste-ready prompt + checklist |
| How the real writer actually builds a piece | `<writer>/06-tape-study.md` |
| Fresh frames, words by job, and what never to copy | `<writer>/07-phrasebook.md` |

## Ground rules baked into every file
- **Devices, not vocabulary.** The repos reverse-engineer the machinery. Fresh jokes every week; nobody's actual sentences get reused.
- **One primary voice per post.** Seasoning is allowed; two skeletons is mush.
- **League register for content, borrowed register for narrator.** The crude stuff lives in the nouns and the buttons, not the intensifiers.
- **One sincere beat per post.** All four writers have one; so should every wrap-up.
- **Fixed section names, fresh content.** The bit returns; the joke doesn't.

## Status of the four writers (Sept 2026)
- **King** — retired from the column Feb 2024. Frozen format; ideal for pastiche.
- **Magary** — active. WYTS 2026 complete; Jamboroo running weekly at Defector. Re-read each season.
- **Berry** — written Love/Hate ended Aug 2025 (final column is in project files). Now a sub-1,200-word Thursday "10 Facts" plus daily video.
- **Van Pelt** — active, midnight SportsCenter; Bad Beats has grown into a long live segment (see `scott-van-pelt/06-tape-study.md`).
- **Stephen A. Smith** — active (Oct 2026): First Take commentator/EP, The Stephen A. Smith Show on SiriusXM. Since Oct 2026 the narrator of the recap, the preview and the Monday Night Watch, under Mike Hunt's byline.

## Samples note
All worked samples use **2025-season team names and Week 9 data as placeholders.** Swap in current-season rosters before reusing any structure.

## Suggested next steps
- Pull one current-season Magary Jamboroo and one 2026 WYTS into project files as living references (he's the only one still producing the long form).
- Section names are already locked — see the six-beat running order in `../VOICE_GUIDE.md`.
- Pick the one or two members who become recurring ventriloquized voices (the Rex Ryan / Stanford Steve slot).
