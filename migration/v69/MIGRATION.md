# v69 migration log

Source: reference snapshot of v69 (export commit 66cbe26), snapshot SHA-256 8c926656de41…

## Output

| Item | Count |
| --- | ---: |
| people | 2,264 |
| shows | 4,236 |
| segments | 19,186 |
| series | 143 |
| promotions | 12 |
| titles | 178 |
| reigns | 795 |
| storylines | 293 |
| chapters | 778 |
| families | 25 |
| episodes split from a shared taping id | 10 |
| shows merged on same series and date | 3 |
| shows created from career records | 467 |
| career moments filed by show name | 569 |
| ring names added from billing evidence | 19 |
| reign records merged into one reign | 107 |
| storyline chapters linked to a show | 133 |

## Corrections to v69

Errors inherited from v69, fixed before migrating (see corrections.ts; parity applies the same fixes).

- **show-date** bulk-event-10222: 2004-03-14 → 2014-03-14 (27 records). The source dataset typed 2004 for the March 14, 2014 SmackDown; its own taping date is March 11, 2014 and every match cites the 2014 results page. Sources: https://kbwrestlingreviews.com/2014/03/14/smackdown-march-14-2014-when-being-big-isnt-enough/
- **show-date** bulk-event-7762: 1998-09-27 → 2006-11-27 (19 records). The source dataset dated the live November 27, 2006 Raw to 1998; its own recorded date is November 27, 2006 and every match cites the 2006 results page. Sources: https://www.wrestlinginc.com/news/2006/11/wwe-raw-results-494452/
- **identity-split** jacob-fatu → rikishi: 620 records before 2010-01-01 moved to Rikishi. v69 credited Rikishi (Solofa Fatu Jr.) as Fatu, The Sultan and Rikishi from 1994 to 2004 to Jacob Fatu, who debuted in 2012. Every Jacob Fatu record before 2010 belongs to Rikishi. Sources: https://en.wikipedia.org/wiki/Rikishi_(wrestler), https://www.cagematch.net/?id=2&nr=14128&page=22
- **profile-field** logan-paul: debut 2026-01-08 → 2022-04-02. v69 listed a 2026 debut, but the archive itself has his matches from 2023; his in-ring debut was the WrestleMania 38 tag match on April 2, 2022. Sources: https://www.sescoops.com/?p=249166

## Review queue

- **identity-decision:** el-grande-americano → ludwig-kaiser (1) — applied
- **identity-decision:** rayo-americano → pete-dunne (1) — applied
- **identity-decision:** bravo-americano → tyler-bate (1) — applied
- **identity-decision:** cruz-montana merged into mike-santana (2) — applied
- **identity-decision:** eli-knight merged into ek-prosper (2) — applied
- **identity:** El Torito (WWF 1997, WWE 2014) is credited to Mascarita Sagrada; probably two or three different people (1)
- **show-merge:** NXT Countdown To Stand & Deliver and NXT Stand & Deliver share one show (2026-04-04) (2)
- **show-merge:** Saturday Night's Main Event and Saturday Night's Main Event - Countdown share one show (2026-07-18) (2)
- **show-merge:** Sunday Night's Main Event and Sunday Night's Main Event - Countdown share one show (2026-09-06) (2)
- **scope:** Confirm these arena shows aired (19)
- **dates:** Segments dated differently from their show (8)
- **duplicates:** Likely double-counted matches (107)
- **links:** Matches with no linked wrestlers (outside the Raw backfill) (42)
- **identity:** Names billed once that no record lists (confirm before adding as ring names) (9)
- **titles:** Championship name rules applied (13)
- **titles:** Titles named "Old/New" by the source (11)
