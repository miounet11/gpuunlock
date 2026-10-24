import { ImageResponse } from "next/og";
import { DEVICES, acceptedCount } from "@/data/devices";

export const alt = "GPU Unlock — NVIDIA SM speed-select override documentation";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  // Derived, not typed in: adding a measured card used to leave this OG card claiming 2.
  const measuredCount = DEVICES.filter((d) => d.status === "measured").length;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0b0d10",
          color: "#e8eaed",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 34, color: "#76b900", letterSpacing: 2 }}>
          GPUUNLOCK.COM
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.1 }}>
            GPU Unlock
          </div>
          <div style={{ display: "flex", fontSize: 36, color: "#b6bcc4", lineHeight: 1.3 }}>
            {`${acceptedCount()} accepted PCI IDs · ${measuredCount} cards measured · 2× tensor peak on RTX 4090`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 28, fontSize: 28, color: "#8b929c" }}>
          <span>Cards</span>
          <span>Benchmarks</span>
          <span>Install</span>
          <span>FAQ</span>
        </div>
      </div>
    ),
    size,
  );
}
