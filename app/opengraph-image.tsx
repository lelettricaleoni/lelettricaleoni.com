import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Lelettrica — Noleggio E-Bike Dro, Lago di Garda";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
    const logoSvg = await readFile(join(process.cwd(), "public", "svg", "LogoLelettrica_full.svg"), "utf8");
    const logoSrc = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`;

    return new ImageResponse(
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "80px",
                fontFamily: "sans-serif",
                background: "linear-gradient(135deg, #eaf1fa 0%, #ffffff 45%, #f2ecf3 100%)",
            }}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                style={{
                    marginTop: 30,
                }}
                src={logoSrc}
                width={720}
                height={352}
                alt="Lelettrica"
            />

            <div
                style={{
                    color: "#366DA1",
                    fontSize: 34,
                    marginTop: 36,
                    fontWeight: 500,
                    letterSpacing: "0.01em",
                }}
            >
                Noleggio E-Bike · Riparazioni
            </div>

            <div
                style={{
                    color: "rgba(0,0,0,0.45)",
                    fontSize: 20,
                    marginTop: 42,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                }}
            >
                Dro · Lago di Garda
            </div>
        </div>,
        { ...size },
    );
}
