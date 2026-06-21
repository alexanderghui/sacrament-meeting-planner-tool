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
      <svg width="62%" height="62%" viewBox="0 0 100 100">
        {/* base */}
        <rect x="26" y="84" width="40" height="6" rx="3" fill="#ffffff" />
        {/* podium body with a slanted reading top */}
        <polygon points="30,56 62,50 56,84 36,84" fill="#ffffff" />
        {/* microphone gooseneck */}
        <path
          d="M58,52 C67,49 73,42 73,30"
          fill="none"
          stroke="#ffffff"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* microphone head */}
        <rect x="68" y="12" width="9" height="19" rx="4.5" fill="#ffffff" />
      </svg>
    </div>
  );
}
