import { AppHeader } from "@/components/app-header";
import { currentUser } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();

  return (
    <div className="min-h-screen bg-background">
      <AppHeader userName={user?.name} />
      <main
        className="max-w-7xl mx-auto py-8 pl-[max(env(safe-area-inset-left),1rem)] pr-[max(env(safe-area-inset-right),1rem)] sm:pl-[max(env(safe-area-inset-left),1.5rem)] sm:pr-[max(env(safe-area-inset-right),1.5rem)] lg:pl-[max(env(safe-area-inset-left),2rem)] lg:pr-[max(env(safe-area-inset-right),2rem)]"
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
      >
        {children}
      </main>
    </div>
  );
}
