"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

interface Props {
  value: string;
  size?: number;
  className?: string;
}

export function QRBlock({ value, size = 110, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const qrValue = value.trim();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !qrValue) return;

    let cancelled = false;
    QRCode.toCanvas(canvas, qrValue, {
      margin: 1,
      width: size,
      color: { dark: "#0b1e3f", light: "#ffffff" },
      errorCorrectionLevel: "M",
    }).catch((error) => {
      if (!cancelled) {
        console.warn("[qr] unable to render QR code:", error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [qrValue, size]);

  if (!qrValue) return null;

  return <canvas ref={canvasRef} className={className} aria-label="Document QR code" />;
}
