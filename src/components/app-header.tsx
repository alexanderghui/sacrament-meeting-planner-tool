"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users,
  CalendarDays,
  History,
  Activity,
  Hand,
  LogOut,
  Eye,
  ArrowLeft,
  ChevronDown,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/lib/actions";
import type { Role } from "@/lib/gate";

const navItems = [
  { href: "/upcoming", label: "Upcoming", icon: CalendarDays },
  { href: "/history", label: "History", icon: History },
  { href: "/members", label: "Members", icon: Users },
  { href: "/set-apart", label: "Set apart", icon: Hand },
  { href: "/activity", label: "Activity", icon: Activity },
];

/*
 * Layout (all CSS-driven, so it follows resize / rotation without measuring):
 *
 * - Below `xs` (520px): two rows. Title + "More" on top; the five sections as
 *   an evenly spaced tab row underneath (icon over a small label).
 * - From `xs` up: one row. The nav area is a size container; text labels
 *   appear next to the icons only once that container is wide enough to hold
 *   them (`@[37.5rem]`), otherwise the items are 44px icon buttons.
 * - `short` (viewport height < 450px): a slimmer bar.
 * - From `tab` (800px) up the Church blue rays sit to the left of the title,
 *   never behind it.
 */
export function AppHeader({
  userName,
  role,
}: {
  userName?: string | null;
  role?: Role | null;
}) {
  const pathname = usePathname();
  const isCoordinatorSession = role === "coordinator";
  const isCoordinatorView =
    pathname === "/coordinator" || pathname.startsWith("/coordinator/");
  // A disabled password gate reports no role and otherwise grants the same
  // access as a clerk session, which keeps local development usable.
  const hasBishopricAccess = !isCoordinatorSession;
  const showBishopricNav = hasBishopricAccess && !isCoordinatorView;
  const home = isCoordinatorView || isCoordinatorSession
    ? "/coordinator"
    : "/upcoming";

  return (
    <header
      className="sticky top-0 z-30 border-b border-[var(--grey15)] bg-white"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Fill the safe-area inset behind the bar with white so the status-bar
          area continues the white header (Safari shows it while scrolling) */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0"
        style={{
          height: "env(safe-area-inset-top)",
          backgroundColor: "#fff",
        }}
      />

      {/* Church blue block + rays, left of the title (tablet/desktop only). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 hidden w-[calc(42px+env(safe-area-inset-left))] bg-[var(--blue25)] tab:block short:hidden"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-[calc(42px+env(safe-area-inset-left))] hidden w-20 overflow-hidden tab:block desk:w-28 short:hidden"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://account.churchofjesuschrist.org/images/blueRays.svg"
          alt=""
          className="absolute left-0 top-0 h-full w-auto max-w-none object-cover object-left"
        />
      </div>

      <div
        className={cn(
          "relative flex flex-wrap items-center gap-x-2",
          "pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]",
          "xs:h-14 xs:flex-nowrap",
          "tab:h-16 tab:pl-[calc(42px+5rem+1.25rem+env(safe-area-inset-left))] tab:pr-[max(1.5rem,env(safe-area-inset-right))]",
          "desk:h-[74px] desk:pl-[calc(42px+7rem+1.5rem+env(safe-area-inset-left))] desk:pr-[max(2rem,env(safe-area-inset-right))]",
          "short:h-11 short:pl-[max(0.75rem,env(safe-area-inset-left))]"
        )}
      >
        <Link
          href={home}
          className="order-1 flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-sm text-foreground xs:h-auto xs:flex-none short:h-10"
        >
          <BrandMark className="size-7 tab:hidden short:flex short:size-6" />
          <span className="truncate text-lg font-light leading-none tab:text-[1.375rem] desk:text-[1.5rem] short:text-base">
            Sacrament Planner
          </span>
        </Link>

        {/* Primary sections. A size container so labels show only when they
            truly fit; min width = the icon-only row so it can never squeeze
            past the viewport (the title truncates instead). */}
        <div className="@container order-3 -mx-1 basis-full xs:order-2 xs:mx-0 xs:min-w-[calc(5*2.75rem)] xs:flex-1 xs:basis-0">
          {showBishopricNav && (
            <nav
              aria-label="Main"
              className="flex items-stretch justify-between pb-1 xs:justify-end xs:gap-0.5 xs:pb-0"
            >
              {navItems.map(({ href, label, icon: Icon }) => {
                const active =
                  pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    title={label}
                    className={cn(
                      "relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-sm px-1 py-1 text-[0.6875rem] leading-tight transition-colors",
                      "xs:flex-none xs:flex-row xs:gap-2 xs:px-2.5 xs:text-sm",
                      "short:min-h-10",
                      active
                        ? "bg-accent font-medium text-[var(--blue30)] xs:text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <Icon className="size-5 shrink-0 xs:size-4" aria-hidden />
                    <span className="whitespace-nowrap xs:sr-only @[37.5rem]:not-sr-only short:sr-only">
                      {label}
                    </span>
                  </Link>
                );
              })}
            </nav>
          )}
          {hasBishopricAccess && isCoordinatorView && (
            <div className="flex justify-end pb-1 xs:pb-0">
              <Link
                href="/upcoming"
                className="flex min-h-11 items-center gap-2 rounded-sm px-3 text-sm text-[var(--link)] transition-colors hover:bg-accent hover:text-[var(--link-hover)]"
              >
                <ArrowLeft className="size-4" aria-hidden />
                Bishopric view
              </Link>
            </div>
          )}
        </div>

        <MoreMenu
          userName={userName}
          coordinatorLink={
            hasBishopricAccess
              ? isCoordinatorView
                ? { href: "/upcoming", label: "Bishopric view", icon: ArrowLeft }
                : { href: "/coordinator", label: "Coordinator view", icon: Eye }
              : null
          }
        />
      </div>
    </header>
  );
}

function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[0.375rem] bg-[linear-gradient(135deg,#006184_0%,#003057_100%)]",
        className
      )}
    >
      <svg viewBox="0 0 100 100" className="size-[70%]" fill="#fff">
        <path
          d="M50,30 C50,20 52,13 56,10"
          fill="none"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <rect x="53" y="3" width="6" height="12" rx="3" />
        <rect x="15" y="29" width="70" height="10" rx="4" />
        <polygon points="29,39 71,39 62,82 38,82" />
        <rect x="33" y="82" width="34" height="6" rx="3" />
      </svg>
    </span>
  );
}

function MoreMenu({
  userName,
  coordinatorLink,
}: {
  userName?: string | null;
  coordinatorLink: {
    href: string;
    label: string;
    icon: typeof Eye;
  } | null;
}) {
  const pathname = usePathname();
  // Remember which page the menu was opened on; navigating anywhere else
  // closes it without needing an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const firstName = userName?.split(" ")[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenOn(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenOn(null);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const CoordIcon = coordinatorLink?.icon;

  return (
    <div
      ref={rootRef}
      className="relative order-2 shrink-0 xs:order-3"
      onBlur={(e) => {
        // Close when keyboard focus moves somewhere outside the menu.
        const next = e.relatedTarget as Node | null;
        if (open && next && !e.currentTarget.contains(next)) setOpenOn(null);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="More"
        onClick={() => setOpenOn(open ? null : pathname)}
        className={cn(
          "flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-sm px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground short:min-h-10",
          open && "bg-accent text-foreground"
        )}
      >
        <UserRound className="size-5 xs:size-4" aria-hidden />
        {firstName && (
          <span className="hidden max-w-[8rem] truncate desk:inline">
            {firstName}
          </span>
        )}
        <ChevronDown
          aria-hidden
          className={cn(
            "hidden size-4 transition-transform tab:block",
            open && "rotate-180"
          )}
        />
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute right-0 top-full z-40 mt-1 w-60 max-w-[calc(100vw-1.5rem)] rounded-sm border border-[var(--grey15)] bg-white py-1 shadow-[var(--boxShadowOverlaid)]"
      >
        {userName && (
          <div className="border-b border-[var(--grey10)] px-4 py-2.5 text-sm">
            <div className="text-xs text-muted-foreground">Signed in as</div>
            <div className="truncate font-medium text-foreground">{userName}</div>
          </div>
        )}
        {coordinatorLink && CoordIcon && (
          <Link
            href={coordinatorLink.href}
            onClick={() => setOpenOn(null)}
            className="flex min-h-11 items-center gap-3 px-4 text-sm text-foreground hover:bg-accent"
          >
            <CoordIcon className="size-4 text-muted-foreground" aria-hidden />
            {coordinatorLink.label}
          </Link>
        )}
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm text-foreground hover:bg-accent"
          >
            <LogOut className="size-4 text-muted-foreground" aria-hidden />
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
