"use client";

import { PDFDownloadLink } from "@react-pdf/renderer";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SOPdfDocument } from "@/components/documents/SOPdfDocument";
import type { SalesOrder } from "@/types";

export function PDFDownloadButton({ doc, qrDataUrl }: { doc: SalesOrder; qrDataUrl?: string }) {
  return (
    <PDFDownloadLink
      document={<SOPdfDocument doc={doc} qrDataUrl={qrDataUrl} />}
      fileName={`${doc.soNumber}.pdf`}
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
