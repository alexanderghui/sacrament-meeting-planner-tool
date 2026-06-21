import type { ReactElement } from "react";

// Shared artwork for the generated app icons (favicon + Apple touch icon).
// A simple white meetinghouse with a spire on the church-blue gradient — opaque
// background so iOS rounds the corners cleanly with no black fill.
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
      <svg width="58%" height="58%" viewBox="0 0 100 100">
        {/* spire */}
        <polygon points="46,32 50,6 54,32" fill="#ffffff" />
        {/* roof */}
        <polygon points="20,58 50,28 80,58" fill="#ffffff" />
        {/* building */}
        <rect x="27" y="55" width="46" height="35" rx="3" fill="#ffffff" />
        {/* doorway */}
        <rect x="43" y="67" width="14" height="23" rx="7" fill="#005175" />
      </svg>
    </div>
  );
}
