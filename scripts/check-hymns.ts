import assert from "node:assert/strict";
import { HYMNS, HYMN_TITLES } from "../src/lib/hymns";

const numbers = HYMNS.map((hymn) => hymn.number);

assert.equal(
  new Set(numbers).size,
  numbers.length,
  "Hymn numbers must be unique"
);
assert.deepEqual(
  numbers,
  [...numbers].sort((a, b) => a - b),
  "Hymns must remain in number order"
);
assert.equal(
  HYMNS.filter((hymn) => hymn.number >= 1000).length,
  82,
  "Hymns for Home and Church should contain the current 82-song release"
);

const latestRelease: Record<number, string> = {
  1063: "Peace, Peace, Be Still",
  1064: "Great Is Thy Faithfulness",
  1065: "Isaiah Said",
  1066: "Fight the Good Fight",
  1067: "It's Joyful to Live the Gospel",
  1068: "To God Be the Glory",
  1069: "Speak to Us, Lord",
  1070: "The Miracle",
  1071: "What God Calls Us To",
  1072: "When I Survey the Wondrous Cross",
};

for (const [number, title] of Object.entries(latestRelease)) {
  assert.equal(
    HYMN_TITLES[Number(number)],
    title,
    `Hymn ${number} should match the official title`
  );
}

console.log(`Verified ${HYMNS.length} hymns, including the July 2026 release.`);
