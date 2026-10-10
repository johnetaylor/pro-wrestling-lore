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
- **identity-split** la-knight → deuce: 140 records before 2010-01-01 moved to Deuce. The 2007-08 matches billed "Deuce" (Deuce 'n Domino on SmackDown, then Raw singles matches in September 2008) are James Reiher Jr., Deuce and later Sim Snuka. v69 matched them to LA Knight because his profile listed Deuce as an alias; Shaun Ricker did not reach WWE television until 2013. Sources: https://thehistoryofwwe.com/wwe-results-2007/, https://thehistoryofwwe.com/wwe-results-2008/
- **identity-split** naraku → yoshiki-inamura: 68 records from 2025-01-01 and before 2025-09-01 moved to Yoshiki Inamura. v69 filed Yoshiki Inamura's 2025 NXT run (February to August) under the ID it later used for Naraku, and the profile import filled that ID from EVIL's page. Inamura, of Pro Wrestling NOAH, and EVIL are different men; every 2025 segment names Inamura. Sources: https://www.thesmackdownhotel.com/events-results/wwe/nxt-2025, https://www.sescoops.com/article/who-is-naraku-former-njpw-star-evil-debuts-in-nxt
- **identity-split** archive-person-theexecutioner → archive-person-buddyrose: 4 records before 1986-01-01 moved to Buddy Rose. The Executioner is a hood several men wore. At WrestleMania I (March 31, 1985), where Tito Santana beat him, it was Buddy Rose. Sources: https://en.wikipedia.org/wiki/WrestleMania_I
- **identity-split** archive-person-theexecutioner → terry-gordy: 4 records from 1996-01-01 moved to Terry Gordy. The Executioner the Undertaker beat at In Your House: It's Time (December 15, 1996) was Terry Gordy under the hood. Sources: https://en.wikipedia.org/wiki/In_Your_House_12:_It%27s_Time
- **identity-split** archive-person-mattmartel → archive-person-mattstriker: 4 records before 2006-01-01 moved to Matt Striker. Matt Striker (Matthew Kaye) wrestled Kurt Angle on SmackDown in February 2005 as Matt Martel. The Matt Martel of 2019-21, Chase Parker's NXT tag partner, is a different man. Sources: https://en.wikipedia.org/wiki/Matt_Striker
- **identity-split** mascarita-sagrada → el-torito: 4 records before 1998-01-01 moved to El Torito. The El Torito of the WWF's 1997 minis matches is not Mascarita Dorada, who debuted in 2000 and was WWE's El Torito from 2013. The 1997 performer isn't identified, so he has a record of his own. Sources: https://en.wikipedia.org/wiki/Mascarita_Dorada
- **identity-split** psicosis → psicosis-ii: 8 records moved to Psicosis II. v69's Psicosis is the original, Dionicio Castellanos (ECW 1995-96, WCW, WWE 2005-06), but its profile was filled from the page of Psicosis II, the AAA wrestler who took the name while the original was in WCW, along with his eight reigns (Atómicos 1998-2007, Mexican middleweight 2002-05, Mexican trios 2011-13, AAA trios 2023-24). Those move to Psicosis II. Sources: https://www.thesmackdownhotel.com/wrestlers/psicosis-ii-ripper, https://www.cagematch.net/?id=2&nr=3579&page=22
- **rating** 2026-06-19-smackdown-match-2: rating removed. v69 gave the 70-second Gunther vs. Cody Rhodes DQ the ratings of the 11-minute Cody Rhodes vs. Gunther title match earlier that night: the same CAGEMATCH score and vote count (6.19 from 124 votes) and the same Observer stars. They belong to the title match, which keeps them. Sources: https://www.cagematch.net/?id=1&nr=448747
- **profile-field** logan-paul: debut 2026-01-08 → 2022-04-02. v69 listed a 2026 debut, but the archive itself has his matches from 2023; his in-ring debut was the WrestleMania 38 tag match on April 2, 2022. Sources: https://www.sescoops.com/?p=249166

## Review queue

- **identity-decision:** el-grande-americano → ludwig-kaiser (1) — applied
- **identity-decision:** rayo-americano → pete-dunne (1) — applied
- **identity-decision:** bravo-americano → tyler-bate (1) — applied
- **identity-decision:** cruz-montana merged into mike-santana (2) — applied
- **identity-decision:** eli-knight merged into ek-prosper (2) — applied
- **identity:** El Torito (WWF 1997, WWE 2014) is credited to Mascarita Sagrada; probably two or three different people (3) — applied (migration/identity-fixes.json)
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
