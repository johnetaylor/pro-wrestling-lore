# Reference audit: Pro Wrestling Lore v69

Snapshot of the published site data as of 2026-10-07, captured by running the site's own scripts. Full lists are in `audit.json`.

## What the site holds

| Item | Count |
| --- | ---: |
| People | 2,265 |
| &nbsp;&nbsp;curated slugs | 231 |
| &nbsp;&nbsp;archive-person IDs | 1,992 |
| &nbsp;&nbsp;hf-person IDs | 42 |
| &nbsp;&nbsp;female placeholder | 211 |
| Moments | 17,473 |
| &nbsp;&nbsp;matches | 13,888 |
| &nbsp;&nbsp;title matches | 2,710 |
| &nbsp;&nbsp;non-match segments | 875 |
| Shows with cards | 3,257 |
| Shows listed in the Shows tab | 3,772 |
| Title reigns | 902 |
| Titles with reigns | 184 |
| Lineage titles | 18 |
| Storylines | 293 |
| Storyline chapters | 703 |
| Families / members | 25 / 147 |
| Rated matches | 380 |
| Calendar events (2026) | 63 + 129 weekly |

Moments run from 1979 to 2026.

## Findings

| Severity | Area | Finding | Count |
| --- | --- | --- | ---: |
| high | Moments | Likely double-counted matches | 106 |
| high | Coverage | Weekly-show years with fewer than 45 indexed cards | 36 |
| medium | People | Same name under different IDs within one scheme | 3 |
| medium | People | Gender comes from portrait placeholders | 2,265 |
| medium | Moments | Competitor lists mix teams, members and guests | 211 |
| medium | Shows | Card matches missing from career data | 40 |
| medium | Titles | Different holders overlapping on one title | 1 |
| medium | Titles | Championship names need one registry | 185 |
| low | Titles | One team reign stored once per member | 94 |
| info | People | Same name under different ID schemes | 0 |
| info | Shows | Shows tab lists more episodes than the career data | 515 |
| info | Titles | Same holder, conflicting reign dates | 0 |
| info | Families | Family members without a career link | 78 |
| info | Sources | Where moment sources point | 17,473 |

### Likely double-counted matches (106)

Same date and same participants under different IDs. Usually one bout recorded twice (mirrored names, a generic title next to a named one); sometimes a real second bout (a restart, a two-fall match). The old site already leaves 106 matches out of its statistics; each group needs a merge-or-keep decision.

- 2026-06-19 Cody Rhodes vs. Gunther → 2026-06-19-smackdown-match-1, 2026-06-19-smackdown-match-2
- 1998-07-13 Kane, Mankind vs. Billy Gunn, Road Dogg → bulk-match-30846, bulk-match-30849
- 1999-09-13 Singles match → bulk-match-36007, bulk-match-36012
- 2000-04-02 Chris Benoit vs. Chris Jericho, Kurt Angle → bulk-match-38637, bulk-match-38638
- 2001-01-22 Al Snow vs. Raven → bulk-match-41579, bulk-match-41580
- 2001-07-10 4-person match → bulk-match-42748, bulk-match-164269
- 2001-09-10 Kurt Angle vs. Rob Van Dam → bulk-match-43125, bulk-match-43126
- 2001-10-16 Singles match → bulk-match-43377, bulk-match-163640
- 2002-01-21 William Regal vs. Edge → bulk-match-162973, bulk-match-44000
- 2002-01-21 Singles match → bulk-match-162974, bulk-match-44001

### Weekly-show years with fewer than 45 indexed cards (36)

Full years (Raw from 1994, SmackDown from 2000, NXT from 2011, through 2025) where fewer than 45 of roughly 52 episodes have an indexed card. Wave 1 fills these.

- Raw 1994: 0 with cards, 49 listed
- Raw 1995: 5 with cards, 50 listed
- Raw 1996: 2 with cards, 51 listed
- Raw 1997: 43 with cards, 50 listed
- Raw 2011: 34 with cards, 52 listed
- Raw 2012: 22 with cards, 53 listed
- Raw 2015: 44 with cards, 52 listed
- Raw 2016: 37 with cards, 52 listed
- Raw 2017: 42 with cards, 42 listed
- Raw 2020: 26 with cards, 46 listed
- Raw 2021: 29 with cards, 52 listed
- Raw 2022: 33 with cards, 34 listed
- Raw 2023: 42 with cards, 46 listed
- SmackDown 2012: 41 with cards, 41 listed

### Same name under different IDs within one scheme (3)

Usually different people who share a ring name, sometimes one person split in two. Review case by case.

- El Grande Americano → chad-gable, el-grande-americano
- Mike Santana → cruz-montana, mike-santana
- Eli Knight → ek-prosper, eli-knight

### Gender comes from portrait placeholders (2,265)

Gender is only recorded as a placeholder image choice (male: 2054, female: 211). The bulk source defaults most people to male, so this needs verification before women's divisions launch.

### Competitor lists mix teams, members and guests (211)

More competitor names than linked people: team names sit next to their members ("The MFTs", "Solo Sikoa", ...) and some guests have no profile. The new model stores teams as their own records.

- 2026-01-09-smackdown-match-3: The MFTs vs Solo Sikoa vs Talla Tonga vs Tama Tonga vs Tonga Loa vs The Wyatt Sicks vs Dexter Lumis vs Erick Rowan vs Joe Gacy vs Uncle Howdy
- 2026-01-12-raw-match-3: Dragon Lee vs Penta vs The Vision vs Austin Theory vs Bronson Reed
- 2026-01-19-raw-match-2: LWO vs Dragon Lee vs Rey Mysterio vs Penta vs The Vision vs Austin Theory vs Bronson Reed vs Logan Paul
- 2026-01-20-nxt-match-3: The Vanity Project vs Brad Baylor vs Ricky Smokes vs Chase U vs Kale Dixon vs Uriah Connors
- 2026-01-23-smackdown-match-3: The MFTs vs Solo Sikoa vs Tama Tonga vs The Wyatt Sicks vs Dexter Lumis vs Joe Gacy
- m49: Alpha Academy vs Akira Tozawa vs Otis vs American Made vs Brutus Creed vs Julius Creed vs Los Americanos vs Bravo Americano vs Rayo Americano vs The New Day vs Kofi Kingston vs Xavier Woods

### Card matches missing from career data (40)

Matches on show cards that no career strip shows; 40 have no linked participants at all (for example 2025 women's title matches whose title field holds a single name).

- 2025-12-29-raw: "Stephanie Vaquer"
- 2025-12-15-raw: "Maxxine Dupri"
- 2025-12-15-raw: "Stephanie Vaquer"
- 2025-11-25-nxt: "Kendal Grey"
- 2025-11-18-nxt: "Blake Monroe"
- 2025-11-10-raw: "Stephanie Vaquer"

### Different holders overlapping on one title (1)

Two holders at once. A few are real (unrecognized champions, brand splits), most are date errors.

- MLW Caribbean Heavyweight Championship: El Mesías (2021-07-10 to 2022-05-12) overlaps Octagón Jr. (from 2022-03-31)

### Championship names need one registry (185)

Reigns name 185 distinct titles, but one championship often appears under several spellings; the WWE Championship alone appears as "Undisputed WWE Championship", "/Undisputed WWE Championship", "WWE Championship", "WWE World Heavyweight/WWE Championship", "WWF / WWE Championship". 1 name is malformed (stray punctuation). Migration maps every spelling to one title record with its lineage.

- /Undisputed WWE Championship

### One team reign stored once per member (94)

Same title, same start, shared holder. Migration merges each set into one reign with its members.

- /Undisputed WWE Championship: Drew McIntyre from 2026-01-09 (undisputed-wwe-2 + profile-reign-drew-mcintyre-194)
- /Undisputed WWE Championship: CM Punk from 2026-07-06 (undisputed-wwe-5 + profile-reign-cm-punk-96)
- WWE Tag Team Championship: Tama Tonga & Jacob Fatu & Tonga Loa from 2024-08-02 (profile-reign-jacob-fatu-322 + profile-reign-tama-tonga-787)
- AAA World Trios Championship: Psycho Clown & Murder Clown & Monster Clown from 2012-03-11 (profile-reign-monster-clown-440 + profile-reign-murder-clown-453)
- AAA World Trios Championship: Psycho Clown & Murder Clown & Monster Clown from 2012-03-11 (profile-reign-monster-clown-440 + profile-reign-psycho-clown-544)
- AAA World Trios Championship: Psycho Clown & Murder Clown & Monster Clown from 2013-02-18 (profile-reign-monster-clown-439 + profile-reign-murder-clown-452)

### Shows tab lists more episodes than the career data (515)

Episodes in the Shows archive with no record in the main show list (listed without indexed cards). They migrate as shows with coverage "listed only".

- Raw: 357
- AEW Collision: 33
- Lucha Libre AAA: 32
- AEW Dynamite: 29
- AEW Dynamite & Collision: 8
- PLE / special: 3
- SmackDown: 2
- NXT: 2

### Family members without a career link (78)

Of 147 family members, these have no career page link yet; many are historical relatives.

### Where moment sources point (17,473)

Top source sites for moments. Records citing only the bulk dataset need an independent source before they count as verified.

- thehistoryofwwe.com: 10822
- wwe.com: 5107
- thesmackdownhotel.com: 893
- cagematch.net: 628
- allelitewrestling.com: 11
- njpw1972.com: 3
- wrestleview.com: 3
- en.wikipedia.org: 2

## Weekly coverage by year

Episodes with an indexed card / episodes listed in the Shows tab.

| Year | Raw | SmackDown | NXT |
| --- | ---: | ---: | ---: |
| 1993 | 6 / 47 | 0 / 0 | 0 / 0 |
| 1994 | 0 / 49 | 0 / 0 | 0 / 0 |
| 1995 | 5 / 50 | 0 / 0 | 0 / 0 |
| 1996 | 2 / 51 | 0 / 0 | 0 / 0 |
| 1997 | 43 / 50 | 0 / 0 | 0 / 0 |
| 1998 | 50 / 56 | 0 / 0 | 0 / 0 |
| 1999 | 50 / 52 | 17 / 19 | 0 / 0 |
| 2000 | 53 / 53 | 50 / 50 | 0 / 0 |
| 2001 | 51 / 53 | 50 / 50 | 0 / 0 |
| 2002 | 50 / 52 | 52 / 52 | 0 / 0 |
| 2003 | 50 / 52 | 51 / 51 | 0 / 0 |
| 2004 | 50 / 52 | 50 / 50 | 0 / 0 |
| 2005 | 49 / 52 | 46 / 46 | 0 / 0 |
| 2006 | 49 / 49 | 49 / 49 | 0 / 0 |
| 2007 | 51 / 52 | 47 / 47 | 0 / 0 |
| 2008 | 52 / 52 | 53 / 53 | 0 / 0 |
| 2009 | 52 / 52 | 53 / 53 | 0 / 0 |
| 2010 | 46 / 52 | 50 / 50 | 0 / 1 |
| 2011 | 34 / 52 | 50 / 50 | 0 / 0 |
| 2012 | 22 / 53 | 41 / 41 | 2 / 2 |
| 2013 | 47 / 52 | 36 / 36 | 0 / 0 |
| 2014 | 46 / 52 | 27 / 27 | 4 / 4 |
| 2015 | 44 / 52 | 26 / 26 | 4 / 4 |
| 2016 | 37 / 52 | 22 / 22 | 1 / 1 |
| 2017 | 42 / 42 | 48 / 48 | 2 / 2 |
| 2018 | 48 / 52 | 46 / 46 | 4 / 4 |
| 2019 | 47 / 48 | 44 / 44 | 18 / 18 |
| 2020 | 26 / 46 | 23 / 23 | 36 / 36 |
| 2021 | 29 / 52 | 39 / 39 | 27 / 27 |
| 2022 | 33 / 34 | 42 / 42 | 0 / 0 |
| 2023 | 42 / 46 | 46 / 46 | 34 / 34 |
| 2024 | 48 / 51 | 46 / 46 | 32 / 32 |
| 2025 | 52 / 52 | 52 / 52 | 54 / 54 |
| 2026 | 39 / 40 | 40 / 40 | 42 / 43 |

## Logic to re-implement

These rules live in code, not data, so migration carries them over as features, not records.

- PLE detection: app.js marks a show as PLE by category or by a show-name pattern (WrestleMania, SummerSlam, Royal Rumble, ...).
- Historical display names: a person shows a different name before 2025 or in 2025 (importedEventNames, yearRosters).
- Default roster filter: RAW and SmackDown checked, NXT and AAA unchecked; brands combine with OR.
- PWL rating: equal-weight mean of available source scores on a 0–100 scale (matchRatings.method, ratingUI.normalize).
- Statistics record sets and the 106 excluded matches (statisticsRecord, statisticsQuality).
- Rivalry clustering for feud highlighting (careerRivalries.find / clusters).
- Championship lineage tree layout (lineageUI.config / layout).
- Show catalog grouping by promotion and series (showsUI.seriesFor).
- Explorer HTML for Cody and Hogan: biography, trained by, moves, managers, signature matches (captured as rendered HTML in the snapshot).
