import { ImageResponse } from "next/og";

export const alt =
  "needed.chat — anonymous rooms for whatever you needed to talk about";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          backgroundColor: "#FAFAF8",
          padding: "80px 96px",
        }}
      >
        {/* Logo mark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "48px",
          }}
        >
          <svg
            width="72"
            height="72"
            viewBox="0 0 56 56"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="56" height="56" rx="14" fill="#C66B3D" />
            <rect x="14" y="11" width="28" height="20" rx="4" fill="white" />
            <polygon points="16,29 12,38 24,29" fill="white" />
          </svg>
          <div
            style={{
              display: "flex",
              fontSize: "40px",
              fontWeight: 700,
              color: "#1A1A1A",
            }}
          >
            needed.chat
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            display: "flex",
            fontSize: "72px",
            fontWeight: 700,
            color: "#1A1A1A",
            lineHeight: 1.15,
            letterSpacing: "-2px",
            maxWidth: "980px",
          }}
        >
          What have you needed to talk about?
        </div>

        {/* Subline */}
        <div
          style={{
            display: "flex",
            marginTop: "36px",
            fontSize: "32px",
            color: "#6B6B6B",
          }}
        >
          Anonymous rooms · No profiles · Free
        </div>

        {/* Accent bar */}
        <div
          style={{
            display: "flex",
            marginTop: "48px",
            width: "160px",
            height: "10px",
            borderRadius: "5px",
            backgroundColor: "#C66B3D",
          }}
        />
      </div>
    ),
    size
  );
}
