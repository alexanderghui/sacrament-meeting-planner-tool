import { getSetAparts } from "@/lib/set-apart";
import { SetApartList } from "@/components/set-apart-list";

export const dynamic = "force-dynamic";

export default async function SetApartPage() {
  const items = await getSetAparts();
  return <SetApartList items={items} />;
}
