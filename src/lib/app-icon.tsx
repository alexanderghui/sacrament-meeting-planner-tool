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
      <svg width="64%" height="64%" viewBox="0 0 100 100">
        {/* wide reading desk / lectern top (the hero, front-on) */}
        <rect x="22" y="22" width="56" height="11" rx="4" fill="#ffffff" />
        {/* solid pedestal tapering gently to a modest foot */}
        <polygon points="33,34 67,34 61,80 39,80" fill="#ffffff" />
        {/* base */}
        <rect x="34" y="80" width="32" height="6" rx="3" fill="#ffffff" />
      </svg>
    </div>
  );
}
