"use client";

import { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DOPdfDocument } from "@/components/documents/DOPdfDocument";
import { DOCUMENT_LOGO_PATH, downloadBlob, imageToDataUrl } from "@/lib/pdf-download";
import type { DeliveryOrder, POAllocation } from "@/types";

export function PDFDownloadButton({
  doc,
  qrDataUrl,
  allocations,
}: {
  doc: DeliveryOrder;
  qrDataUrl?: string;
  allocations?: POAllocation[];
}) {
  const [isGenerating, setIsGenerating] = useState(false);

  async function downloadPdf() {
    setIsGenerating(true);

    try {
      const logoDataUrl = await imageToDataUrl(DOCUMENT_LOGO_PATH);
      const blob = await pdf(
        <DOPdfDocument doc={doc} qrDataUrl={qrDataUrl} allocations={allocations} logoSrc={logoDataUrl} />,
      ).toBlob();
      downloadBlob(blob, `${doc.doNumber}.pdf`);
    } catch (error) {
      console.error("Failed to generate delivery order PDF", error);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Button variant="default" onClick={downloadPdf} disabled={isGenerating}>
      <Download className="h-4 w-4" />
      {isGenerating ? "Generating..." : "Download PDF"}
    </Button>
  );
}
