"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Scale, Wallet } from "lucide-react";
import { dataAdapter } from "@/services";
import { ReportShell } from "@/components/reports/ReportShell";
import { KpiTile } from "@/components/reports/KpiTile";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { currency } from "@/lib/utils";
import { reconcileERP, type ReconciliationIssue } from "@/lib/reconciliation";
import type {
  Customer,
  Invoice,
  POAllocation,
  Product,
  PurchaseOrder,
  StockMovement,
  Supplier,
} from "@/types";

type ReconciliationData = {
  customers: Customer[];
  suppliers: Supplier[];
  products: Product[];
  invoices: Invoice[];
  purchaseOrders: PurchaseOrder[];
  stockMovements: StockMovement[];
  poAllocations: POAllocation[];
};

const CATEGORY_LABEL: Record<ReconciliationIssue["category"], string> = {
  receivables: "A/R",
  payables: "A/P",
  inventory: "Stock",
  allocations: "Allocation",
};

export default function ReconciliationReportPage() {
  const [data, setData] = useState<ReconciliationData | null>(null);

  useEffect(() => {
    Promise.all([
      dataAdapter.customers.list(),
      dataAdapter.suppliers.list(),
      dataAdapter.products.list(),
      dataAdapter.invoices.list(),
      dataAdapter.purchaseOrders.list(),
      dataAdapter.stockMovements.list(),
      dataAdapter.poAllocations.list(),
    ]).then(
      ([
        customers,
        suppliers,
        products,
        invoices,
        purchaseOrders,
        stockMovements,
        poAllocations,
      ]) =>
        setData({
          customers,
          suppliers,
          products,
          invoices,
          purchaseOrders,
          stockMovements,
          poAllocations,
        }),
    );
  }, []);

  const issues = useMemo(() => (data ? reconcileERP(data) : []), [data]);
  const financialVariance = issues
    .filter((issue) => issue.category === "receivables" || issue.category === "payables")
    .reduce((sum, issue) => sum + Math.abs(issue.variance ?? 0), 0);
  const untrackedStock = issues.filter(
    (issue) => issue.category === "inventory" && issue.expected === null,
  ).length;

  return (
    <ReportShell
      title="Ledger Reconciliation"
      description="Compares recorded balances with invoices, purchase orders, stock movements, and FIFO allocations."
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiTile
          label="Exceptions"
          value={issues.length}
          icon={issues.length ? AlertTriangle : CheckCircle2}
          tone={issues.length ? "danger" : "success"}
        />
        <KpiTile
          label="Financial variance"
          value={currency(financialVariance)}
          icon={Wallet}
          tone={financialVariance > 0.01 ? "warning" : "success"}
        />
        <KpiTile
          label="Untracked stock"
          value={untrackedStock}
          icon={Scale}
          tone={untrackedStock ? "danger" : "success"}
        />
        <KpiTile
          label="Status"
          value={issues.length ? "Review" : "Balanced"}
          icon={issues.length ? AlertTriangle : CheckCircle2}
          tone={issues.length ? "warning" : "success"}
        />
      </div>

      <Card>
        <div className="p-5 border-b border-slate-100">
          <h2 className="font-semibold">Reconciliation exceptions</h2>
          <p className="text-xs text-slate-500 mt-1">
            Investigate every exception before period close or production cutover.
          </p>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Area</TH>
              <TH>Record</TH>
              <TH>Issue</TH>
              <TH className="!text-right">Recorded</TH>
              <TH className="!text-right">Expected</TH>
              <TH className="!text-right">Variance</TH>
            </TR>
          </THead>
          <TBody>
            {issues.map((issue, index) => (
              <TR key={`${issue.category}-${issue.entityId}-${index}`}>
                <TD>
                  <Badge variant={issue.category === "inventory" ? "warning" : "danger"}>
                    {CATEGORY_LABEL[issue.category]}
                  </Badge>
                </TD>
                <TD className="font-medium text-slate-900">{issue.label}</TD>
                <TD className="text-slate-600">{issue.detail}</TD>
                <TD className="text-right tabular-nums">
                  {issue.recorded == null ? "-" : issue.category === "receivables" || issue.category === "payables"
                    ? currency(issue.recorded)
                    : issue.recorded.toLocaleString()}
                </TD>
                <TD className="text-right tabular-nums">
                  {issue.expected == null ? "-" : issue.category === "receivables" || issue.category === "payables"
                    ? currency(issue.expected)
                    : issue.expected.toLocaleString()}
                </TD>
                <TD className="text-right tabular-nums font-medium text-red-700">
                  {issue.variance == null ? "-" : issue.category === "receivables" || issue.category === "payables"
                    ? currency(issue.variance)
                    : issue.variance.toLocaleString()}
                </TD>
              </TR>
            ))}
            {data && issues.length === 0 && (
              <TR>
                <TD colSpan={6} className="py-12 text-center text-emerald-700">
                  All checked ledgers reconcile.
                </TD>
              </TR>
            )}
            {!data && (
              <TR>
                <TD colSpan={6} className="py-12 text-center text-slate-500">
                  Loading reconciliation data...
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </Card>
    </ReportShell>
  );
}
