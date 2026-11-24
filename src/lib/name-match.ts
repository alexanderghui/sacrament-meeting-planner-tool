// First-name compatibility shared by the speaker resolver (scripts/match.ts) and
// the add-only roster backfill. "Compatible" means any of:
//   1. exact first name
//   2. ≤1-character typo (e.g. Torin↔Torrin)
//   3. nickname/shortening (Alex↔Alexander, Mike↔Michael, Deb↔Debra)

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

export function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2; // we only care about ≤1
  const d = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return d[a.length][b.length];
}

// Phonetic nicknames that aren't a prefix of the formal name (those are handled
// generically below). Keyed by nickname → possible formal names. Checked both
// directions, so the roster can store either form.
const NICKNAMES: Record<string, string[]> = {
  mike: ["michael"], dave: ["david"], tom: ["thomas"], bob: ["robert"],
  bill: ["william"], jim: ["james"], jimmy: ["james"], jack: ["john"],
  rick: ["richard"], dick: ["richard"], steve: ["steven", "stephen"],
  joe: ["joseph"], tony: ["anthony"], ed: ["edward"], ted: ["edward", "theodore"],
  nate: ["nathan", "nathaniel"], hank: ["henry"], chuck: ["charles"],
  charlie: ["charles"], drew: ["andrew"], andy: ["andrew"], nick: ["nicholas"],
  greg: ["gregory"], jeff: ["jeffrey"], ron: ["ronald"], don: ["donald"],
  ken: ["kenneth"], larry: ["lawrence"], fred: ["frederick"],
  peggy: ["margaret"], sally: ["sarah"], becky: ["rebecca"], betsy: ["elizabeth"],
  liz: ["elizabeth"], beth: ["elizabeth"], kate: ["katherine", "kathryn"],
  katie: ["katherine"], cathy: ["catherine"], patty: ["patricia"],
  trish: ["patricia"], sandy: ["sandra"], connie: ["constance"],
  ginny: ["virginia"], jake: ["jacob"], margie: ["marjorie", "margaret"],
  gabe: ["gabriel"], will: ["william"], ben: ["benjamin"], dan: ["daniel"],
};

export function nicknameMatch(a: string, b: string): boolean {
  return (NICKNAMES[a] || []).includes(b) || (NICKNAMES[b] || []).includes(a);
}

// One first name is a prefix of the other (≥3 chars), e.g. Alex→Alexander,
// Deb→Debra, Matt→Matthew, Madi→Madison, Sam→Samuel.
export function prefixMatch(a: string, b: string): boolean {
  return (
    (b.length >= 3 && a.startsWith(b)) || (a.length >= 3 && b.startsWith(a))
  );
}

export function firstNameCompatible(memberFirst: string, speakerFirst: string): boolean {
  return (
    memberFirst === speakerFirst ||
    lev(memberFirst, speakerFirst) <= 1 ||
    prefixMatch(memberFirst, speakerFirst) ||
    nicknameMatch(memberFirst, speakerFirst)
  );
}
