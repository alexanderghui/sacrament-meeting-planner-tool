// Preview what the Trello sync would write — renders each upcoming card's
// title + description from the planner DB, no Trello calls.
//   npm run db:migrate first if needed; then: npx tsx scripts/preview-trello.ts
import { previewUpcomingCards } from "../src/lib/trello-sync";

async function main() {
  const cards = await previewUpcomingCards();
  if (!cards.length) {
    console.log("(no upcoming meetings with content in range)");
    return;
  }
  for (const c of cards) {
    console.log("\n============================================================");
    console.log("TITLE:", c.name);
    console.log("------------------------------------------------------------");
    console.log(c.desc);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
