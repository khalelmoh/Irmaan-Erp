import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Irmaan ERP | System Update",
  description: "Irmaan ERP is temporarily undergoing system updates.",
};

export default function RootLayout() {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            background:
              "linear-gradient(135deg, #062f35 0%, #0b5961 55%, #0e7378 100%)",
            color: "#ffffff",
            fontFamily: "Arial, sans-serif",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: "620px" }}>
            <div
              style={{
                width: "72px",
                height: "72px",
                margin: "0 auto 28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "18px",
                backgroundColor: "rgba(255,255,255,0.14)",
                border: "1px solid rgba(255,255,255,0.25)",
                fontSize: "28px",
                fontWeight: 700,
              }}
            >
              IE
            </div>

            <p
              style={{
                marginBottom: "14px",
                color: "#8ee3df",
                fontSize: "14px",
                fontWeight: 700,
                letterSpacing: "2px",
                textTransform: "uppercase",
              }}
            >
              Irmaan ERP
            </p>

            <h1
              style={{
                margin: "0 0 20px",
                fontSize: "clamp(32px, 6vw, 54px)",
                lineHeight: 1.1,
              }}
            >
              System update in progress
            </h1>

            <p
              style={{
                margin: "0 auto",
                maxWidth: "520px",
                color: "#d1eeee",
                fontSize: "18px",
                lineHeight: 1.7,
              }}
            >
                404 / Server Cannot be reached.
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}
