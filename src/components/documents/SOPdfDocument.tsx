"use client";

/* eslint-disable jsx-a11y/alt-text -- React PDF Image is not a DOM img element. */
import {
  Document, Page, Text, View, StyleSheet, Image,
} from "@react-pdf/renderer";
import { COMPANY, currency, formatDate } from "@/lib/utils";
import type { SalesOrder } from "@/types";
import { SO_STATUS_LABEL } from "@/lib/sales-order";

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#0f172a" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2 solid #1e3a8a", paddingBottom: 10 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 72, height: 72, objectFit: "contain" },
  brandText: { marginLeft: 10 },
  brandName: { fontSize: 14, fontWeight: 700, color: "#1e3a8a" },
  smallMuted: { fontSize: 8, color: "#64748b" },
  metaRight: { alignItems: "flex-end" },
  docTitle: { fontSize: 9, color: "#64748b", letterSpacing: 2 },
  docNumber: { fontSize: 18, fontWeight: 700, color: "#1e3a8a", marginTop: 2 },
  sectionRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  card: { border: "1 solid #e2e8f0", padding: 8, borderRadius: 3, flex: 1 },
  cardLabel: { fontSize: 8, color: "#64748b", letterSpacing: 1, marginBottom: 3 },
  cardTitle: { fontWeight: 700, fontSize: 11 },
  cardSub: { fontSize: 9, color: "#475569" },
  table: { marginTop: 12, border: "1 solid #cbd5e1" },
  thead: { flexDirection: "row", backgroundColor: "#1e3a8a" },
  th: { color: "white", padding: 6, fontSize: 9, fontWeight: 700, textTransform: "uppercase" },
  tr: { flexDirection: "row", borderTop: "1 solid #e2e8f0" },
  td: { padding: 6, fontSize: 10 },
  totalsBox: { marginTop: 12, alignSelf: "flex-end", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottom: "1 solid #f1f5f9" },
  totalLabel: { color: "#475569", fontSize: 10 },
  totalValue: { fontSize: 10 },
  grandTotalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderTop: "2 solid #94a3b8", borderBottom: "2 solid #94a3b8", marginTop: 4 },
  grandLabel: { fontSize: 12, fontWeight: 700 },
  grandValue: { fontSize: 12, fontWeight: 700 },
  notesBox: { marginTop: 14, border: "1 solid #e2e8f0", padding: 8, borderRadius: 3 },
  signRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 36 },
  signBlock: { flex: 1, marginHorizontal: 6 },
  signLine: { borderBottom: "1 solid #94a3b8", height: 36 },
  signLabel: { fontSize: 8, color: "#64748b", marginTop: 4, letterSpacing: 1 },
  footer: { marginTop: 24, paddingTop: 8, borderTop: "1 solid #e2e8f0", fontSize: 8, color: "#64748b", flexDirection: "row", justifyContent: "space-between" },
});

export function SOPdfDocument({ doc, qrDataUrl }: { doc: SalesOrder; qrDataUrl?: string }) {
  return (
    <Document title={doc.soNumber} author={COMPANY.name}>
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          <View style={s.brandRow}>
            <Image src="/logo.jpeg" style={s.logo} />
            <View style={s.brandText}>
              <Text style={s.brandName}>{COMPANY.name}</Text>
              <Text style={s.smallMuted}>{COMPANY.tagline}</Text>
              <Text style={s.smallMuted}>{COMPANY.address}</Text>
              <Text style={s.smallMuted}>{COMPANY.phone} · {COMPANY.email}</Text>
            </View>
          </View>
          <View style={s.metaRight}>
            <Text style={s.docTitle}>{doc.status === "quotation" ? "QUOTATION" : "SALES ORDER"}</Text>
            <Text style={s.docNumber}>{doc.soNumber}</Text>
            <Text style={s.smallMuted}>Date: {formatDate(doc.orderDate)}</Text>
            {doc.status === "quotation" && doc.validUntil && (
              <Text style={s.smallMuted}>Valid until: {formatDate(doc.validUntil)}</Text>
            )}
            <Text style={s.smallMuted}>Status: {SO_STATUS_LABEL[doc.status].toUpperCase()}</Text>
          </View>
        </View>

        <View style={s.sectionRow}>
          <View style={s.card}>
            <Text style={s.cardLabel}>CUSTOMER</Text>
            <Text style={s.cardTitle}>{doc.customerSnapshot.name}</Text>
            <Text style={s.cardSub}>{doc.customerSnapshot.address}</Text>
            <Text style={s.cardSub}>{doc.customerSnapshot.phone}</Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardLabel}>SALESPERSON</Text>
            <Text style={s.cardTitle}>{doc.salespersonName}</Text>
          </View>
        </View>

        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.th, { width: "7%" }]}>#</Text>
            <Text style={[s.th, { flex: 1 }]}>PRODUCT</Text>
            <Text style={[s.th, { width: "10%", textAlign: "right" }]}>QTY</Text>
            <Text style={[s.th, { width: "10%" }]}>UNIT</Text>
            <Text style={[s.th, { width: "16%", textAlign: "right" }]}>UNIT PRICE</Text>
            <Text style={[s.th, { width: "17%", textAlign: "right" }]}>LINE TOTAL</Text>
          </View>
          {doc.items.map((it, i) => (
            <View key={i} style={s.tr}>
              <Text style={[s.td, { width: "7%" }]}>{i + 1}</Text>
              <Text style={[s.td, { flex: 1 }]}>{it.name}</Text>
              <Text style={[s.td, { width: "10%", textAlign: "right" }]}>{it.quantity.toLocaleString()}</Text>
              <Text style={[s.td, { width: "10%" }]}>{it.unit}</Text>
              <Text style={[s.td, { width: "16%", textAlign: "right" }]}>{currency(it.unitPrice)}</Text>
              <Text style={[s.td, { width: "17%", textAlign: "right", fontWeight: 700 }]}>{currency(it.lineTotal)}</Text>
            </View>
          ))}
        </View>

        <View style={s.totalsBox}>
          <View style={s.totalRow}><Text style={s.totalLabel}>Subtotal</Text><Text style={s.totalValue}>{currency(doc.subtotal)}</Text></View>
          <View style={s.totalRow}><Text style={s.totalLabel}>Tax ({(doc.taxRate * 100).toFixed(2)}%)</Text><Text style={s.totalValue}>{currency(doc.taxAmount)}</Text></View>
          <View style={s.grandTotalRow}><Text style={s.grandLabel}>Total</Text><Text style={s.grandValue}>{currency(doc.total)}</Text></View>
        </View>

        {doc.notes && (
          <View style={s.notesBox}>
            <Text style={s.cardLabel}>NOTES</Text>
            <Text style={s.cardSub}>{doc.notes}</Text>
          </View>
        )}

        <View style={s.signRow}>
          <View style={s.signBlock}><View style={s.signLine} /><Text style={s.signLabel}>PREPARED BY</Text></View>
          <View style={s.signBlock}><View style={s.signLine} /><Text style={s.signLabel}>CUSTOMER SIGNATURE</Text></View>
          <View style={[s.signBlock, { alignItems: "center" }]}>
            {qrDataUrl ? <Image src={qrDataUrl} style={{ width: 80, height: 80 }} /> : <View style={{ width: 80, height: 80 }} />}
            <Text style={[s.signLabel, { textAlign: "center" }]}>SCAN TO VERIFY</Text>
          </View>
        </View>

        <View style={s.footer}>
          <Text>{COMPANY.name} · {COMPANY.website}</Text>
          <Text>Tax ID: {COMPANY.taxId}</Text>
        </View>
      </Page>
    </Document>
  );
}
