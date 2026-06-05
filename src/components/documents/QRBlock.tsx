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

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, value, {
      margin: 1,
      width: size,
      color: { dark: "#0b1e3f", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });
  }, [value, size]);

  return <canvas ref={canvasRef} className={className} aria-label="Document QR code" />;
}
