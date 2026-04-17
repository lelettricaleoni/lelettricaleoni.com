import { ImageResponse } from "next/og";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Lelettrica — Noleggio E-Bike Dro, Lago di Garda";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
    const bgBuf = await readFile(join(process.cwd(), "public", "images", "about.jpg"));
    const bgSrc = `data:image/jpeg;base64,${bgBuf.toString("base64")}`;

    // Load full logo, recolor every fill to white, then rasterise via sharp at 2x
    const LOGO_W = 1240;
    const LOGO_H = 608;
    const logoSvgRaw = await readFile(join(process.cwd(), "public", "svg", "LogoLelettrica_full.svg"), "utf8");

    const logoPngBuf = await sharp(
        Buffer.from(logoSvgRaw.replace(/<svg /, `<svg width="${LOGO_W}" height="${LOGO_H}" `)),
    )
        .png()
        .toBuffer();

    const logoSrc = `data:image/png;base64,${logoPngBuf.toString("base64")}`;

    return new ImageResponse(
        <div
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                display: "flex",
                fontFamily: "sans-serif",
            }}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={bgSrc}
                alt=""
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "center 20%",
                }}
            />
            {/* Vignette: dark edges, open in the middle so the trail stays visible */}
            <div
                style={{
                    display: "none",
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    background: "radial-gradient(ellipse at center, rgba(0,0,0,0.25) 0%, rgba(8,18,34,0.78) 85%)",
                }}
            />

            {/* Bottom fade for the pill */}
            <div
                style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    width: "100%",
                    height: "45%",
                    background: "linear-gradient(to top, rgba(8,18,34,0.7) 0%, rgba(8,18,34,0) 100%)",
                }}
            />

            {/* Content */}
            <div
                style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "60px",
                }}
            >
                <div
                    style={{
                        color: "rgba(255,255,255,0.8)",
                        fontSize: 22,
                        letterSpacing: "0.3em",
                        textTransform: "uppercase",
                        marginBottom: 36,
                        textShadow: "0 2px 12px rgba(0,0,0,0.5)",
                    }}
                >
                    Dro · Lago di Garda · Trentino
                </div>

                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    style={{
                        marginTop: 100,
                    }}
                    src={logoSrc}
                    width={380}
                    height={172}
                    alt="Lelettrica"
                />

                <div
                    style={{
                        color: "rgba(255,255,255,0.9)",
                        fontSize: 30,
                        marginTop: 80,
                        textAlign: "center",
                        textShadow: "0 2px 12px rgba(0,0,0,0.55)",
                        letterSpacing: "0.02em",
                    }}
                >
                    Noleggio E-Bike · Riparazioni
                </div>

                <div
                    style={{
                        marginTop: 20,
                        background: "rgba(0,0,0,0.5)",
                        border: "1px solid rgba(255,255,255,0.28)",
                        borderRadius: 999,
                        padding: "12px 32px",
                        color: "white",
                        fontSize: 20,
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                    }}
                >
                    <div
                        style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: "#22c55e",
                            boxShadow: "0 0 12px #22c55e",
                        }}
                    />
                    Aperto tutti i giorni · 09:00 – 19:00
                </div>
            </div>
        </div>,
        { ...size },
    );
}
