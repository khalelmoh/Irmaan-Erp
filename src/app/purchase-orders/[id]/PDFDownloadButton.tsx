"use client";

import { PDFDownloadLink } from "@react-pdf/renderer";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { POPdfDocument } from "@/components/documents/POPdfDocument";
import type { PurchaseOrder } from "@/types";

export function PDFDownloadButton({ doc, qrDataUrl }: { doc: PurchaseOrder; qrDataUrl?: string }) {
  return (
    <PDFDownloadLink
      document={<POPdfDocument doc={doc} qrDataUrl={qrDataUrl} />}
      fileName={`${doc.poNumber}.pdf`}
    >
      {({ loading }) => (
        <Button disabled={loading}>
          <Download className="h-4 w-4" />
          {loading ? "Generating…" : "Download PDF"}
        </Button>
      )}
    </PDFDownloadLink>
  );
}
