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
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Left circle */}
        <div
          style={{
            position: "absolute",
            left: 2,
            top: 4,
            width: 22,
            height: 24,
            borderRadius: "50%",
            background: "white",
          }}
        />
        {/* Right circle */}
        <div
          style={{
            position: "absolute",
            right: 2,
            top: 4,
            width: 22,
            height: 24,
            borderRadius: "50%",
            background: "white",
          }}
        />
        {/* Intersection overlay */}
        <div
          style={{
            position: "absolute",
            left: 9,
            top: 6,
            width: 14,
            height: 20,
            borderRadius: "50%",
            background: "#C66B3D",
          }}
        />
      </div>
    ),
    { ...size }
  );
}