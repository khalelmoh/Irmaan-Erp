"use client";

import { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SOPdfDocument } from "@/components/documents/SOPdfDocument";
import { DOCUMENT_LOGO_PATH, downloadBlob, imageToDataUrl } from "@/lib/pdf-download";
import type { SalesOrder } from "@/types";

export function PDFDownloadButton({ doc, qrDataUrl }: { doc: SalesOrder; qrDataUrl?: string }) {
  const [isGenerating, setIsGenerating] = useState(false);

  async function downloadPdf() {
    setIsGenerating(true);

    try {
      const logoDataUrl = await imageToDataUrl(DOCUMENT_LOGO_PATH);
      const blob = await pdf(<SOPdfDocument doc={doc} qrDataUrl={qrDataUrl} logoSrc={logoDataUrl} />).toBlob();
      downloadBlob(blob, `${doc.soNumber}.pdf`);
    } catch (error) {
      console.error("Failed to generate sales order PDF", error);
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
