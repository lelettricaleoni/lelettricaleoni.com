import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Lelettrica — Noleggio E-Bike Dro, Lago di Garda";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The logo, as a data URI — or null if it cannot be read. A link preview
 * without the logo is a worse preview; an image that answers 500 is no preview
 * at all, on every page that names it (see next.config.ts for why the read
 * fails when the file is not bundled). The tests download this route, so a
 * missing logo does not pass unnoticed.
 */
async function loadLogo(): Promise<string | null> {
    try {
        const logoSvg = await readFile(join(process.cwd(), "public", "svg", "LogoLelettrica_full.svg"), "utf8");
        return `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`;
    } catch (err) {
        console.error("opengraph-image: logo not readable, rendering without it", err);
        return null;
    }
}

export default async function OgImage() {
    const logoSrc = await loadLogo();

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
            {logoSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    style={{
                        marginTop: 30,
                    }}
                    src={logoSrc}
                    width={720}
                    height={352}
                    alt="Lelettrica"
                />
            ) : (
                <div style={{ color: "#1e3a5f", fontSize: 120, fontWeight: 700 }}>Lelettrica</div>
            )}

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
