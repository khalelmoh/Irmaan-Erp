"use client";

/**
 * React-PDF document for the Delivery Order. Used by the download flow.
 * Kept in a client module because @react-pdf/renderer is rendered on the client.
 */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Svg,
  Path,
  Rect,
  Defs,
  LinearGradient,
  Stop,
} from "@react-pdf/renderer";
import { COMPANY, formatDate } from "@/lib/utils";
import type { DeliveryOrder, POAllocation } from "@/types";

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#0f172a" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "2 solid #1e3a8a",
    paddingBottom: 10,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandText: { marginLeft: 10 },
  brandName: { fontSize: 14, fontWeight: 700, color: "#1e3a8a" },
  metaRight: { alignItems: "flex-end" },
  smallMuted: { fontSize: 8, color: "#64748b" },
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
  loadingTitle: { fontSize: 8, color: "#64748b", letterSpacing: 1, marginTop: 14, marginBottom: 4, fontWeight: 700 },
  loadingRow: { flexDirection: "row", borderBottom: "1 solid #e2e8f0" },
  loadingTh: { backgroundColor: "#f1f5f9", padding: 6, fontSize: 9, fontWeight: 700, width: "20%" },
  loadingTd: { padding: 6, fontSize: 10, width: "30%" },
  signRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 36 },
  signBlock: { flex: 1, marginHorizontal: 6 },
  signLine: { borderBottom: "1 solid #94a3b8", height: 36 },
  signLabel: { fontSize: 8, color: "#64748b", marginTop: 4, letterSpacing: 1 },
  signName: { fontSize: 10, fontWeight: 700 },
  footer: { marginTop: 24, paddingTop: 8, borderTop: "1 solid #e2e8f0", fontSize: 8, color: "#64748b", flexDirection: "row", justifyContent: "space-between" },
  poTitle: { fontSize: 8, color: "#64748b", letterSpacing: 1, marginTop: 14, marginBottom: 4, fontWeight: 700 },
  poThead: { flexDirection: "row", backgroundColor: "#f1f5f9" },
  poTh: { padding: 6, fontSize: 8, fontWeight: 700, color: "#334155", textTransform: "uppercase" },
  poTr: { flexDirection: "row", borderTop: "1 solid #e2e8f0" },
  poTd: { padding: 6, fontSize: 9 },
});

export function DOPdfDocument({ doc, qrDataUrl, allocations }: { doc: DeliveryOrder; qrDataUrl?: string; allocations?: POAllocation[] }) {
  return (
    <Document title={doc.doNumber} author={COMPANY.name}>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.headerRow}>
          <View style={s.brandRow}>
            <Svg width={34} height={34} viewBox="0 0 40 40">
              <Defs>
                <LinearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor="#1d4ed8" />
                  <Stop offset="1" stopColor="#0b1e3f" />
                </LinearGradient>
              </Defs>
              <Rect x={2} y={2} width={36} height={36} rx={9} fill="url(#g)" />
              {/* Letter "I" */}
              <Rect x={12} y={9} width={16} height={2.6} rx={1} fill="#ffffff" />
              <Rect x={18.4} y={11.6} width={3.2} height={13} fill="#ffffff" />
              <Rect x={12} y={24.6} width={16} height={2.6} rx={1} fill="#ffffff" />
              {/* Trade-route arc */}
              <Path d="M8 31 Q 20 27 32 31" stroke="#60a5fa" strokeWidth={1.8} fill="none" />
            </Svg>
            <View style={s.brandText}>
              <Text style={s.brandName}>{COMPANY.name}</Text>
              <Text style={s.smallMuted}>{COMPANY.tagline}</Text>
              <Text style={s.smallMuted}>{COMPANY.address}</Text>
              <Text style={s.smallMuted}>{COMPANY.phone} · {COMPANY.email}</Text>
            </View>
          </View>
          <View style={s.metaRight}>
            <Text style={s.docTitle}>DELIVERY ORDER</Text>
            <Text style={s.docNumber}>{doc.doNumber}</Text>
            <Text style={s.smallMuted}>Date: {formatDate(doc.orderDate)}</Text>
            <Text style={s.smallMuted}>Status: {doc.status.toUpperCase()}</Text>
          </View>
        </View>

        {/* Bill-to */}
        <View style={s.sectionRow}>
          <View style={s.card}>
            <Text style={s.cardLabel}>DELIVER TO</Text>
            <Text style={s.cardTitle}>{doc.customerSnapshot.name}</Text>
            <Text style={s.cardSub}>{doc.customerSnapshot.address}</Text>
            <Text style={s.cardSub}>{doc.customerSnapshot.phone}</Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardLabel}>ORDER DETAILS</Text>
            <Text style={s.cardSub}>Salesperson: <Text style={{ color: "#0f172a" }}>{doc.salespersonName}</Text></Text>
            <Text style={s.cardSub}>D.O Number: <Text style={{ color: "#0f172a" }}>{doc.doNumber}</Text></Text>
            <Text style={s.cardSub}>Order Date: <Text style={{ color: "#0f172a" }}>{formatDate(doc.orderDate)}</Text></Text>
          </View>
        </View>

        {/* Items */}
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.th, { width: "8%" }]}>#</Text>
            <Text style={[s.th, { flex: 1 }]}>PRODUCT</Text>
            <Text style={[s.th, { width: "20%", textAlign: "right" }]}>QUANTITY</Text>
            <Text style={[s.th, { width: "15%" }]}>UNIT</Text>
          </View>
          {doc.items.map((it, i) => (
            <View key={i} style={s.tr}>
              <Text style={[s.td, { width: "8%" }]}>{i + 1}</Text>
              <Text style={[s.td, { flex: 1 }]}>{it.name}</Text>
              <Text style={[s.td, { width: "20%", textAlign: "right" }]}>{it.quantity.toLocaleString()}</Text>
              <Text style={[s.td, { width: "15%" }]}>{it.unit}</Text>
            </View>
          ))}
        </View>

        {/* Purchase Order References */}
        {allocations && allocations.length > 0 && (
          <>
            <Text style={s.poTitle}>PURCHASE ORDER REFERENCES</Text>
            <View style={{ border: "1 solid #cbd5e1" }}>
              <View style={s.poThead}>
                <Text style={[s.poTh, { width: "30%" }]}>PO NUMBER</Text>
                <Text style={[s.poTh, { flex: 1 }]}>PRODUCT</Text>
                <Text style={[s.poTh, { width: "20%", textAlign: "right" }]}>QTY ALLOCATED</Text>
              </View>
              {allocations.map((a, i) => (
                <View key={i} style={s.poTr}>
                  <Text style={[s.poTd, { width: "30%", fontWeight: 700, color: "#1e3a8a" }]}>{a.poNumber}</Text>
                  <Text style={[s.poTd, { flex: 1 }]}>{a.productName}</Text>
                  <Text style={[s.poTd, { width: "20%", textAlign: "right" }]}>{a.quantity.toLocaleString()}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Loading */}
        <Text style={s.loadingTitle}>LOADING DETAILS</Text>
        <View style={{ border: "1 solid #e2e8f0" }}>
          <View style={s.loadingRow}>
            <Text style={s.loadingTh}>Driver Name</Text>
            <Text style={s.loadingTd}>{doc.loadingDetails.driverName}</Text>
            <Text style={s.loadingTh}>Mobile</Text>
            <Text style={s.loadingTd}>{doc.loadingDetails.mobile}</Text>
          </View>
          <View style={s.loadingRow}>
            <Text style={s.loadingTh}>Truck Plate</Text>
            <Text style={s.loadingTd}>{doc.loadingDetails.truckPlate}</Text>
            <Text style={s.loadingTh}>Owner</Text>
            <Text style={s.loadingTd}>{doc.loadingDetails.owner}</Text>
          </View>
          <View style={[s.loadingRow, { borderBottom: 0 }]}>
            <Text style={s.loadingTh}>Destination</Text>
            <Text style={[s.loadingTd, { width: "80%", fontWeight: 700, textTransform: "uppercase" }]}>
              {doc.loadingDetails.destination}
            </Text>
          </View>
        </View>

        {/* Signatures + QR */}
        <View style={s.signRow}>
          <View style={s.signBlock}>
            <View style={s.signLine} />
            <Text style={s.signLabel}>ISSUED BY</Text>
            <Text style={s.signName}>{doc.salespersonName}</Text>
          </View>
          <View style={s.signBlock}>
            <View style={s.signLine} />
            <Text style={s.signLabel}>RECEIVED BY</Text>
            <Text style={s.signName}>{doc.loadingDetails.driverName}</Text>
          </View>
          <View style={[s.signBlock, { alignItems: "center" }]}>
            {qrDataUrl ? <Image src={qrDataUrl} style={{ width: 90, height: 90 }} /> : <View style={{ width: 90, height: 90 }} />}
            <Text style={[s.signLabel, { textAlign: "center" }]}>SCAN TO VERIFY</Text>
          </View>
        </View>

        <View style={[s.signRow, { marginTop: 18 }]}>
          <View style={s.signBlock} />
          <View style={s.signBlock}>
            <View style={s.signLine} />
            <Text style={s.signLabel}>AUTHORIZED BY</Text>
            <Text style={s.signName}>{doc.authorizedBy ?? ""}</Text>
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
