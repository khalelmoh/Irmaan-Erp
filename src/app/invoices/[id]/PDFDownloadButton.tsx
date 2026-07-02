"use client";

import { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvoicePdfDocument } from "@/components/documents/InvoicePdfDocument";
import { DOCUMENT_LOGO_PATH, downloadBlob, imageToDataUrl } from "@/lib/pdf-download";
import type { Invoice } from "@/types";

export function PDFDownloadButton({ doc, qrDataUrl }: { doc: Invoice; qrDataUrl?: string }) {
  const [isGenerating, setIsGenerating] = useState(false);

  async function downloadPdf() {
    setIsGenerating(true);

    try {
      const logoDataUrl = await imageToDataUrl(DOCUMENT_LOGO_PATH);
      const blob = await pdf(
        <InvoicePdfDocument doc={doc} qrDataUrl={qrDataUrl} logoSrc={logoDataUrl} />,
      ).toBlob();
      downloadBlob(blob, `${doc.invoiceNumber}.pdf`);
    } catch (error) {
      console.error("Failed to generate invoice PDF", error);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Button onClick={downloadPdf} disabled={isGenerating}>
      <Download className="h-4 w-4" />
      {isGenerating ? "Generating..." : "Download PDF"}
    </Button>
  );
}
