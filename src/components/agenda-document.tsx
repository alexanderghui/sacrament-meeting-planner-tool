import type { PlannerMeeting, MeetingTypeValue } from "@/lib/meetings";
import {
  buildProgram,
  hymnText,
  SACRAMENT_PREP,
  AFTER_SACRAMENT_HYMN,
  REVERENCE_THANKS,
  MOVE_INS_FOOTER,
  RELEASED_HEADER,
  RELEASED_FOOTER,
  SUSTAINED_HEADER,
  SUSTAINED_FOOTER,
} from "@/lib/agenda";
import type { RosterChange } from "@/lib/meetings";

const TYPE_TITLE: Record<MeetingTypeValue, string> = {
  sacrament: "Sacrament Meeting",
  fast_and_testimony: "Fast & Testimony Meeting",
  ward_conference: "Ward Conference",
  stake_conference: "Stake Conference",
  general_conference: "General Conference",
  primary_program: "Primary Program",
  easter_program: "Easter Program",
  christmas_program: "Christmas Program",
  no_meeting: "No Meeting",
};

// Types with no ward-run sacrament program to lay out.
const NO_PROGRAM: MeetingTypeValue[] = [
  "stake_conference",
  "general_conference",
  "no_meeting",
];

function fullDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/* ----------------------------- atoms ------------------------------ */

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <p className="leading-relaxed">
      <span className="font-semibold">{label}:</span>{" "}
      <span>{value}</span>
    </p>
  );
}

function SectionRule() {
  return <hr className="my-6 border-t border-[var(--grey10)]" />;
}

// A say-aloud boilerplate line — readable, lightly set off from spoken fields.
function Boilerplate({ children }: { children: React.ReactNode }) {
  return (
    <p className="leading-relaxed text-[var(--grey40)]">{children}</p>
  );
}

function RosterBlock({
  title,
  header,
  footer,
  rows,
}: {
  title: string;
  header: string;
  footer: string;
  rows: RosterChange[];
}) {
  return (
    <div className="rounded-sm border border-[var(--grey10)] p-4">
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5 text-sm text-[var(--grey40)]">{header}</p>
      <ul className="my-3 space-y-1">
        {rows.map((r, i) => (
          <li key={i} className="leading-snug">
            <span className="font-medium">{r.name}</span>
            {r.calling && (
              <span className="text-[var(--grey40)]"> — {r.calling}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-sm italic text-[var(--grey40)]">{footer}</p>
    </div>
  );
}

/* --------------------------- document ----------------------------- */

export function AgendaDocument({
  meeting,
  hymnTitles,
}: {
  meeting: PlannerMeeting;
  hymnTitles: Record<number, string>;
}) {
  const noProgram = NO_PROGRAM.includes(meeting.type);

  const program = buildProgram({
    type: meeting.type,
    speakers: meeting.speakers,
    intermediateHymn: meeting.intermediateHymn,
    musicalNumbers: meeting.musicalNumbers,
    programBody: meeting.programBody,
    hymnFallback: hymnTitles,
  });

  const hasWardBusiness =
    !!meeting.wardBusinessNote?.trim() ||
    meeting.moveIns.length > 0 ||
    meeting.released.length > 0 ||
    meeting.sustained.length > 0;

  return (
    <article className="agenda mx-auto max-w-2xl bg-card px-8 py-10 text-[15px] text-[var(--grey90)] shadow-[var(--boxShadowDetached)] sm:px-12 sm:py-12 print:max-w-none print:shadow-none">
      {/* Title */}
      <header className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--grey35)]">
          Fruit Heights 10th Ward
        </p>
        <h1 className="mt-1 text-2xl font-light leading-tight text-foreground">
          {TYPE_TITLE[meeting.type]}
        </h1>
        <p className="mt-1 text-[var(--grey40)]">{fullDate(meeting.date)}</p>
      </header>

      {/* Presiding / Conducting / Visitors */}
      <div className="space-y-1.5">
        {meeting.presiding && (
          <Field label="Presiding" value={meeting.presiding} />
        )}
        {meeting.conducting && (
          <Field label="Conducting" value={meeting.conducting} />
        )}
        {meeting.stakeVisitors?.trim() && (
          <Field label="Stake Visitors" value={meeting.stakeVisitors} />
        )}
      </div>

      {noProgram ? (
        <p className="mt-8 text-center text-[var(--grey40)]">
          No ward sacrament meeting program this week.
        </p>
      ) : (
        <>
          {/* Announcements */}
          {meeting.announcements.length > 0 && (
            <>
              <SectionRule />
              <div>
                <p className="mb-2 font-semibold">Announcements</p>
                <ol className="ml-5 list-decimal space-y-2 leading-relaxed marker:text-[var(--grey35)]">
                  {meeting.announcements.map((a, i) => (
                    <li key={i} className="pl-1 whitespace-pre-line">
                      {a}
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}

          <SectionRule />

          {/* Music leadership + opening */}
          <div className="space-y-1.5">
            {meeting.accompanist && (
              <Field label="Organist" value={meeting.accompanist} />
            )}
            {meeting.chorister && (
              <Field label="Conducting Music" value={meeting.chorister} />
            )}
          </div>

          <div className="mt-4 space-y-1.5">
            {meeting.openingHymn != null && (
              <Field
                label="Opening Hymn"
                value={hymnText(meeting.openingHymn, hymnTitles)}
              />
            )}
            {meeting.openingPrayer?.name && (
              <Field
                label="Invocation (Opening Prayer)"
                value={meeting.openingPrayer.name}
              />
            )}
          </div>

          {meeting.openingNote?.trim() && (
            <p className="mt-4 leading-relaxed">{meeting.openingNote}</p>
          )}

          {/* Stake / ward business */}
          {meeting.stakeBusiness?.trim() && (
            <>
              <SectionRule />
              <Field label="Stake Business" value={meeting.stakeBusiness} />
            </>
          )}

          {hasWardBusiness && (
            <>
              <SectionRule />
              <p className="mb-3 font-semibold">Ward Business</p>
              <div className="space-y-4">
                {meeting.wardBusinessNote?.trim() && (
                  <p className="leading-relaxed">{meeting.wardBusinessNote}</p>
                )}
                {meeting.moveIns.length > 0 && (
                  <div className="rounded-sm border border-[var(--grey10)] p-4">
                    <p className="font-semibold">New Family Move-Ins</p>
                    <ul className="my-3 space-y-1">
                      {meeting.moveIns.map((m, i) => (
                        <li key={i} className="font-medium leading-snug">
                          {m}
                        </li>
                      ))}
                    </ul>
                    <p className="text-sm italic text-[var(--grey40)]">
                      {MOVE_INS_FOOTER}
                    </p>
                  </div>
                )}
                {meeting.released.length > 0 && (
                  <RosterBlock
                    title="Individuals to be Released"
                    header={RELEASED_HEADER}
                    footer={RELEASED_FOOTER}
                    rows={meeting.released}
                  />
                )}
                {meeting.sustained.length > 0 && (
                  <RosterBlock
                    title="Individuals to be Sustained"
                    header={SUSTAINED_HEADER}
                    footer={SUSTAINED_FOOTER}
                    rows={meeting.sustained}
                  />
                )}
              </div>
            </>
          )}

          {/* Sacrament */}
          <SectionRule />
          <div className="space-y-3">
            <Boilerplate>{SACRAMENT_PREP}</Boilerplate>
            {meeting.sacramentHymn != null && (
              <Field
                label="Sacrament Hymn"
                value={hymnText(meeting.sacramentHymn, hymnTitles)}
              />
            )}
            <Boilerplate>{AFTER_SACRAMENT_HYMN}</Boilerplate>
            <Boilerplate>{REVERENCE_THANKS}</Boilerplate>
          </div>

          {/* Program body */}
          {program.length > 0 && (
            <>
              <SectionRule />
              <div className="space-y-3">
                {program.map((item, i) => {
                  if (item.kind === "testimony") {
                    return (
                      <p key={i} className="font-semibold">
                        Bearing of Testimonies
                      </p>
                    );
                  }
                  if (item.kind === "primaryProgram") {
                    return (
                      <p key={i} className="font-semibold">
                        Primary Program
                      </p>
                    );
                  }
                  if (item.kind === "speaker") {
                    return (
                      <div key={i} className="leading-relaxed">
                        <span className="font-semibold">
                          Speaker {item.position}:
                        </span>{" "}
                        <span>{item.name}</span>
                        {item.topic && (
                          <span className="text-[var(--grey40)]">
                            {" "}
                            — {item.topic}
                          </span>
                        )}
                      </div>
                    );
                  }
                  const label =
                    item.kind === "intermediateHymn"
                      ? "Intermediate Hymn"
                      : "Musical Number";
                  return <Field key={i} label={label} value={item.text} />;
                })}
              </div>
            </>
          )}

          {/* Closing */}
          {(meeting.closingHymn != null || meeting.closingPrayer?.name) && (
            <>
              <SectionRule />
              <div className="space-y-1.5">
                {meeting.closingHymn != null && (
                  <Field
                    label="Closing Hymn"
                    value={hymnText(meeting.closingHymn, hymnTitles)}
                  />
                )}
                {meeting.closingPrayer?.name && (
                  <Field
                    label="Benediction (Closing Prayer)"
                    value={meeting.closingPrayer.name}
                  />
                )}
              </div>
            </>
          )}
        </>
      )}
    </article>
  );
}
