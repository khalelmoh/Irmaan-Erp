"use client";

import { PDFDownloadLink } from "@react-pdf/renderer";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DOPdfDocument } from "@/components/documents/DOPdfDocument";
import type { DeliveryOrder, POAllocation } from "@/types";

export function PDFDownloadButton({ doc, qrDataUrl, allocations }: { doc: DeliveryOrder; qrDataUrl?: string; allocations?: POAllocation[] }) {
  return (
    <PDFDownloadLink
      document={<DOPdfDocument doc={doc} qrDataUrl={qrDataUrl} allocations={allocations} />}
      fileName={`${doc.doNumber}.pdf`}
    >
      {({ loading }) => (
        <Button variant="default" disabled={loading}>
          <Download className="h-4 w-4" />
          {loading ? "Generating…" : "Download PDF"}
        </Button>
      )}
    </PDFDownloadLink>
  );
}
