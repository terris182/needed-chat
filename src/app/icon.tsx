import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "#C66B3D",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="20"
          height="18"
          viewBox="0 0 20 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2 2C2 1.45 2.45 1 3 1H17C17.55 1 18 1.45 18 2V12C18 12.55 17.55 13 17 13H7L3 17V13H3C2.45 13 2 12.55 2 12V2Z"
            fill="white"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}