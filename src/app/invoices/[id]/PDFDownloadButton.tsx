"use client";

import { PDFDownloadLink } from "@react-pdf/renderer";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvoicePdfDocument } from "@/components/documents/InvoicePdfDocument";
import type { Invoice } from "@/types";

export function PDFDownloadButton({ doc, qrDataUrl }: { doc: Invoice; qrDataUrl?: string }) {
  return (
    <PDFDownloadLink
      document={<InvoicePdfDocument doc={doc} qrDataUrl={qrDataUrl} />}
      fileName={`${doc.invoiceNumber}.pdf`}
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
