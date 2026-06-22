"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Trash2,
  ChevronDown,
  FileText,
  Archive,
  Music,
  HandHelping,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  MemberCombobox,
  type SpeakerSelection,
} from "@/components/member-combobox";
import { HymnCombobox } from "@/components/hymn-combobox";
import { MeetingAgendaFields } from "@/components/meeting-agenda-fields";
import { ProgramEditor } from "@/components/program-editor";
import { cn } from "@/lib/utils";
import {
  setPrayer,
  updateMeetingType,
  updateMeetingText,
  updateMeetingHymn,
  removeMeeting,
  archiveMeeting,
} from "@/lib/actions";
import type {
  PlannerMeeting,
  PickerMember,
  AssignmentStatusValue,
  MeetingTypeValue,
} from "@/lib/meetings";

const TYPE_LABELS: Record<MeetingTypeValue, string> = {
  sacrament: "Sacrament meeting",
  fast_and_testimony: "Fast & testimony",
  ward_conference: "Ward conference",
  stake_conference: "Stake conference",
  general_conference: "General conference",
  primary_program: "Primary program",
  easter_program: "Easter program",
  christmas_program: "Christmas program",
  no_meeting: "No meeting",
};

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

export function MeetingCard({
  meeting: initial,
  members,
  defaultExpanded = false,
}: {
  meeting: PlannerMeeting;
  members: PickerMember[];
  defaultExpanded?: boolean;
}) {
  const [meeting, setMeeting] = useState(initial);
  const [expanded, setExpanded] = useState(defaultExpanded);
  // Speaker names + statuses (in program order) for the collapsed-card preview,
  // kept fresh by the ProgramEditor via onSpeakersChange.
  const [programSpeakers, setProgramSpeakers] = useState<
    { name: string | null; status: AssignmentStatusValue }[]
  >(() =>
    initial.speakers
      .filter((s) => s.name)
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ name: s.name, status: s.status }))
  );
  const [, startTransition] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try {
        await fn();
      } catch {
        router.refresh();
      }
    });

  const hasProgram = [
    "sacrament",
    "fast_and_testimony",
    "ward_conference",
    "primary_program",
    "easter_program",
    "christmas_program",
  ].includes(meeting.type);
  // Primary program has no bishopric-tracked speakers; everything else with a
  // program does (Easter/Christmas behave like a normal sacrament meeting).
  const hasSpeakers = [
    "sacrament",
    "ward_conference",
    "easter_program",
    "christmas_program",
  ].includes(meeting.type);

  function selFields(sel: SpeakerSelection | null) {
    const memberId = sel && "memberId" in sel ? sel.memberId : null;
    const guestName = sel && "guestName" in sel ? sel.guestName : null;
    const name = memberId
      ? members.find((mm) => mm.id === memberId)?.name ?? null
      : guestName;
    return { memberId, guestName, name };
  }

  function pickPrayer(
    role: "opening_prayer" | "closing_prayer",
    sel: SpeakerSelection | null
  ) {
    const { memberId, name } = selFields(sel);
    const key = role === "opening_prayer" ? "openingPrayer" : "closingPrayer";
    setMeeting((m) => ({
      ...m,
      [key]: sel ? { id: "tmp", memberId, name } : null,
    }));
    run(() => setPrayer(meeting.id, role, sel));
  }

  const confirmedCount = programSpeakers.filter(
    (s) => s.status === "confirmed" || s.status === "spoke"
  ).length;
  const speakerPreview = programSpeakers.map((s) => s.name).join(", ");

  return (
    <Card className="overflow-hidden">
      {/* Collapsed header: toggle + quick "open program" link */}
      <div className="flex w-full items-stretch">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex min-h-[44px] min-w-0 flex-1 items-center justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--grey2)] sm:px-6"
          aria-expanded={expanded}
        >
          <div className="min-w-0">
            <h3 className="text-base font-semibold leading-tight text-foreground sm:text-lg">
              {formatDate(meeting.date)}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{TYPE_LABELS[meeting.type]}</Badge>
              {hasSpeakers && (
                <Badge
                  variant={
                    programSpeakers.length > 0 &&
                    confirmedCount === programSpeakers.length
                      ? "green"
                      : "neutral"
                  }
                >
                  {confirmedCount}/{programSpeakers.length} confirmed
                </Badge>
              )}
              {hasSpeakers && speakerPreview && (
                <span className="truncate text-xs text-muted-foreground">
                  {speakerPreview}
                </span>
              )}
            </div>
          </div>
          <ChevronDown
            className={cn(
              "size-5 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180"
            )}
          />
        </button>
        <a
          href={`/program/${meeting.id}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Open program in a new tab"
          aria-label="Open program in a new tab"
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center border-l border-[var(--grey10)] px-4 text-muted-foreground transition-colors hover:bg-[var(--grey2)] hover:text-[var(--blue30)]"
        >
          <FileText className="size-5" />
        </a>
      </div>

      {expanded && (
        <div className="space-y-6 border-t border-[var(--grey10)] px-6 py-5">
          {/* Meeting type + open formatted program */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="w-full sm:max-w-xs">
              <Label>Meeting type</Label>
              <Select
                value={meeting.type}
                onChange={(e) => {
                  const type = e.target.value as MeetingTypeValue;
                  setMeeting((m) => ({ ...m, type }));
                  run(() => updateMeetingType(meeting.id, type));
                }}
                aria-label="Meeting type"
              >
                {Object.entries(TYPE_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <a
              href={`/program/${meeting.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ size: "default" }),
                "min-h-[44px] w-full sm:w-auto"
              )}
            >
              <FileText className="size-4" />
              View program
            </a>
          </div>

          {!hasProgram ? (
            <p className="text-sm text-muted-foreground">
              No ward program to plan for this Sunday.
            </p>
          ) : (
            <>
              {/* Presiding / conducting */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Presiding</Label>
                  <Input
                    defaultValue={meeting.presiding ?? ""}
                    placeholder="Bishop / counselor"
                    onBlur={(e) =>
                      run(() =>
                        updateMeetingText(meeting.id, "presiding", e.target.value)
                      )
                    }
                  />
                </div>
                <div>
                  <Label>Conducting</Label>
                  <Input
                    defaultValue={meeting.conducting ?? ""}
                    placeholder="Counselor conducting"
                    onBlur={(e) =>
                      run(() =>
                        updateMeetingText(meeting.id, "conducting", e.target.value)
                      )
                    }
                  />
                </div>
                <div>
                  <Label>Chorister</Label>
                  <Input
                    defaultValue={meeting.chorister ?? ""}
                    placeholder="Music leader"
                    onBlur={(e) =>
                      run(() =>
                        updateMeetingText(meeting.id, "chorister", e.target.value)
                      )
                    }
                  />
                </div>
                <div>
                  <Label>Pianist / organist</Label>
                  <Input
                    defaultValue={meeting.accompanist ?? ""}
                    placeholder="Accompanist"
                    onBlur={(e) =>
                      run(() =>
                        updateMeetingText(meeting.id, "accompanist", e.target.value)
                      )
                    }
                  />
                </div>
              </div>

              {/* The rest of the form follows the program order top-to-bottom. */}

              {/* Announcements */}
              <MeetingAgendaFields
                part="announcements"
                meetingId={meeting.id}
                announcements={meeting.announcements}
                moveIns={meeting.moveIns}
                released={meeting.released}
                sustained={meeting.sustained}
                stakeVisitors={meeting.stakeVisitors}
                stakeBusiness={meeting.stakeBusiness}
                wardBusinessNote={meeting.wardBusinessNote}
                openingNote={meeting.openingNote}
              />

              {/* Opening hymn + invocation */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>
                    <Music className="size-3.5 text-[var(--blue30)]" /> Opening hymn
                  </Label>
                  <HymnCombobox
                    value={meeting.openingHymn}
                    ariaLabel="Opening hymn"
                    onChange={(n) => {
                      setMeeting((m) => ({ ...m, openingHymn: n }));
                      run(() => updateMeetingHymn(meeting.id, "openingHymn", n));
                    }}
                  />
                </div>
                <div>
                  <Label>
                    <HandHelping className="size-3.5 text-[var(--blue30)]" />{" "}
                    Invocation (opening prayer)
                  </Label>
                  <MemberCombobox
                    members={members}
                    value={meeting.openingPrayer?.memberId ?? null}
                    guestName={
                      meeting.openingPrayer && !meeting.openingPrayer.memberId
                        ? meeting.openingPrayer.name
                        : null
                    }
                    onChange={(sel) => pickPrayer("opening_prayer", sel)}
                    ariaLabel="Opening prayer"
                  />
                </div>
              </div>

              {/* Ward business & sustainings */}
              <MeetingAgendaFields
                part="business"
                meetingId={meeting.id}
                announcements={meeting.announcements}
                moveIns={meeting.moveIns}
                released={meeting.released}
                sustained={meeting.sustained}
                stakeVisitors={meeting.stakeVisitors}
                stakeBusiness={meeting.stakeBusiness}
                wardBusinessNote={meeting.wardBusinessNote}
                openingNote={meeting.openingNote}
              />

              {/* Sacrament hymn */}
              <div className="sm:max-w-sm">
                <Label>
                  <Music className="size-3.5 text-[var(--blue30)]" /> Sacrament hymn
                </Label>
                <HymnCombobox
                  value={meeting.sacramentHymn}
                  ariaLabel="Sacrament hymn"
                  onChange={(n) => {
                    setMeeting((m) => ({ ...m, sacramentHymn: n }));
                    run(() => updateMeetingHymn(meeting.id, "sacramentHymn", n));
                  }}
                />
              </div>

              {/* Program order: speakers + musical numbers + intermediate hymn,
                  drag-orderable. Hidden for fast & testimony (testimonies) and
                  primary program (the agenda just prints "Primary Program"). */}
              {!["fast_and_testimony", "primary_program"].includes(
                meeting.type
              ) && (
                <ProgramEditor
                  meetingId={meeting.id}
                  members={members}
                  allowSpeakers={hasSpeakers}
                  initialSpeakers={meeting.speakers}
                  initialIntermediateHymn={meeting.intermediateHymn}
                  initialMusicalNumbers={meeting.musicalNumbers}
                  initialProgramBody={meeting.programBody}
                  onSpeakersChange={setProgramSpeakers}
                />
              )}

              {/* Closing hymn + benediction */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>
                    <Music className="size-3.5 text-[var(--blue30)]" /> Closing hymn
                  </Label>
                  <HymnCombobox
                    value={meeting.closingHymn}
                    ariaLabel="Closing hymn"
                    onChange={(n) => {
                      setMeeting((m) => ({ ...m, closingHymn: n }));
                      run(() => updateMeetingHymn(meeting.id, "closingHymn", n));
                    }}
                  />
                </div>
                <div>
                  <Label>
                    <HandHelping className="size-3.5 text-[var(--blue30)]" />{" "}
                    Benediction (closing prayer)
                  </Label>
                  <MemberCombobox
                    members={members}
                    value={meeting.closingPrayer?.memberId ?? null}
                    guestName={
                      meeting.closingPrayer && !meeting.closingPrayer.memberId
                        ? meeting.closingPrayer.name
                        : null
                    }
                    onChange={(sel) => pickPrayer("closing_prayer", sel)}
                    ariaLabel="Closing prayer"
                  />
                </div>
              </div>
            </>
          )}

          {/* Archive (move to History early) / Remove */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--grey10)] pt-4">
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[44px] text-muted-foreground hover:bg-[var(--grey3)] hover:text-foreground sm:min-h-8"
              title="Move this Sunday to History now, before its date passes"
              onClick={() => run(() => archiveMeeting(meeting.id))}
            >
              <Archive className="size-4" />
              Archive to history
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[44px] text-muted-foreground hover:bg-[var(--status-red-bg)] hover:text-[var(--status-red)] sm:min-h-8"
              onClick={() => {
                if (confirm(`Remove ${formatDate(meeting.date)}?`))
                  run(() => removeMeeting(meeting.id));
              }}
            >
              <Trash2 className="size-4" />
              Remove meeting
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
