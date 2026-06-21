import type { ReactElement } from "react";

// Shared artwork for the generated app icons (favicon + Apple touch icon).
// A white chapel pulpit (slanted lectern on a post + base) with a gooseneck
// microphone, on the church-blue gradient. Opaque background so iOS rounds the
// corners cleanly with no black fill.
export function AppIcon(): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #006184 0%, #003057 100%)",
      }}
    >
      <svg width="66%" height="66%" viewBox="0 0 100 100">
        {/* thin microphone on a gooseneck rising from the middle of the stand */}
        <path
          d="M50,30 C50,20 52,13 56,10"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <rect x="53" y="3" width="6" height="12" rx="3" fill="#ffffff" />
        {/* wide reading desk / lectern top (the hero, front-on) */}
        <rect x="15" y="29" width="70" height="10" rx="4" fill="#ffffff" />
        {/* solid pedestal tapering gently to a modest foot */}
        <polygon points="29,39 71,39 62,82 38,82" fill="#ffffff" />
        {/* base */}
        <rect x="33" y="82" width="34" height="6" rx="3" fill="#ffffff" />
      </svg>
    </div>
  );
}
