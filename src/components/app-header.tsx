"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, CalendarDays, History, Activity, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/lib/actions";

const navItems = [
  { href: "/members", label: "Members", icon: Users },
  { href: "/upcoming", label: "Upcoming", icon: CalendarDays },
  { href: "/history", label: "History", icon: History },
  { href: "/activity", label: "Activity", icon: Activity },
];

export function AppHeader({ userName }: { userName?: string | null }) {
  const pathname = usePathname();
  const firstName = userName?.split(" ")[0];

  return (
    <header
      className="bg-white border-b border-[var(--grey15)] sticky top-0 z-10"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Fill the safe-area inset behind the bar with the church blue so the
          notch/status-bar area reads as intentional in standalone PWA mode */}
      <div
        className="absolute left-0 right-0 top-0"
        style={{
          height: "env(safe-area-inset-top)",
          backgroundColor: "var(--blue25)",
        }}
      />
      <div className="relative h-[74px]">
        {/* Solid blue rectangle on the far left — extend up behind the inset */}
        <div
          className="absolute left-0 h-full"
          style={{
            backgroundColor: "var(--blue25)",
            width: "42px",
            top: "calc(-1 * env(safe-area-inset-top))",
            height: "calc(100% + env(safe-area-inset-top))",
          }}
        />

        {/* Decorative blue rays design — narrower on phones to free up room for
            the wordmark + nav icons; full width from sm up (desktop unchanged) */}
        <div className="absolute left-[42px] top-0 bottom-0 w-28 sm:w-48 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://account.churchofjesuschrist.org/images/blueRays.svg"
            alt=""
            className="absolute left-0 top-0 h-full w-auto object-cover object-left"
          />
        </div>

        <div
          className="h-full px-[max(1rem,env(safe-area-inset-left))] sm:px-6 lg:px-8 [padding-right:max(1rem,env(safe-area-inset-right))] sm:[padding-right:1.5rem] lg:[padding-right:2rem]"
        >
          <div className="flex items-center justify-between h-full">
            <Link
              href="/members"
              className="relative z-10 ml-[52px] sm:ml-[90px] min-w-0 truncate text-base sm:text-[1.5rem] font-light text-foreground leading-tight"
            >
              Sacrament Planner
            </Link>

            <nav className="flex shrink-0 items-center gap-0.5 sm:gap-1">
              {navItems.map(({ href, label, icon: Icon }) => {
                const active =
                  pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center justify-center gap-2 min-h-[44px] md:min-h-0 px-2 sm:px-3 py-2 rounded-sm text-sm font-normal transition-colors",
                      active
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden md:inline">{label}</span>
                  </Link>
                );
              })}
              {firstName && (
                <span className="hidden md:inline px-2 text-sm text-muted-foreground">
                  {firstName}
                </span>
              )}
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="flex items-center justify-center gap-2 min-h-[44px] md:min-h-0 px-2 sm:px-3 py-2 rounded-sm text-sm font-normal text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden md:inline">Sign out</span>
                </button>
              </form>
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
}
