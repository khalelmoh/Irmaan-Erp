"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  CreditCard,
  DatabaseBackup,
  FileText,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Save,
  ShieldCheck,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { dataAdapter } from "@/services";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { logActivity } from "@/lib/audit";
import { errorMessage } from "@/lib/retry";
import type { CompanySettings } from "@/services/types";

const CURRENCY_OPTIONS = [
  { code: "USD", symbol: "$", label: "USD — US Dollar" },
  { code: "SOS", symbol: "Sh.So", label: "SOS — Somali Shilling" },
  { code: "KES", symbol: "KSh", label: "KES — Kenyan Shilling" },
  { code: "ETB", symbol: "Br", label: "ETB — Ethiopian Birr" },
  { code: "AED", symbol: "د.إ", label: "AED — UAE Dirham" },
] as const;

const DEFAULT_SETTINGS: CompanySettings = {
  companyName: "Irmaan Trading & Logistics",
  address: "Hargeisa, Somaliland",
  phone: "+252 63 4 000 000",
  email: "info@irmaan.co",
  taxId: "",
  currency: "USD",
  currencySymbol: "$",
  defaultTaxRate: 0.05,
  defaultPaymentTerms: 30,
  invoiceFooter: "",
  logo: "",
};

function formFromSettings(settings: CompanySettings) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    defaultTaxRate: Number.isFinite(settings.defaultTaxRate)
      ? settings.defaultTaxRate
      : DEFAULT_SETTINGS.defaultTaxRate,
    defaultPaymentTerms: Number.isFinite(settings.defaultPaymentTerms)
      ? settings.defaultPaymentTerms
      : DEFAULT_SETTINGS.defaultPaymentTerms,
  };
}

function compactSettings(settings: CompanySettings): CompanySettings {
  return {
    companyName: settings.companyName.trim(),
    address: settings.address.trim(),
    phone: settings.phone.trim(),
    email: settings.email.trim(),
    taxId: settings.taxId?.trim() ?? "",
    currency: settings.currency.trim().toUpperCase(),
    currencySymbol: settings.currencySymbol.trim(),
    defaultTaxRate: Math.max(0, Math.min(1, Number(settings.defaultTaxRate) || 0)),
    defaultPaymentTerms: Math.max(0, Math.round(Number(settings.defaultPaymentTerms) || 0)),
    invoiceFooter: settings.invoiceFooter?.trim() ?? "",
    logo: settings.logo?.trim() ?? "",
  };
}

export default function SettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const [initial, setInitial] = useState<CompanySettings | null>(null);
  const [form, setForm] = useState<CompanySettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/dashboard");
  }, [user, router]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const settings = formFromSettings(await dataAdapter.settings.get());
      setInitial(settings);
      setForm(settings);
    } catch (error) {
      toast.error("Couldn't load settings", errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const dirty = useMemo(
    () => JSON.stringify(compactSettings(form)) !== JSON.stringify(compactSettings(initial ?? DEFAULT_SETTINGS)),
    [form, initial],
  );

  function update<K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function onCurrencyChange(code: string) {
    const selected = CURRENCY_OPTIONS.find((currency) => currency.code === code);
    setForm((current) => ({
      ...current,
      currency: code,
      currencySymbol: selected?.symbol ?? current.currencySymbol,
    }));
  }

  async function onLogoFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Unsupported logo file", "Please choose a PNG, JPG, or SVG image.");
      return;
    }
    if (file.size > 750_000) {
      toast.error("Logo is too large", "Use a logo smaller than 750 KB.");
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Could not read logo file"));
      reader.readAsDataURL(file);
    });
    update("logo", dataUrl);
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const patch = compactSettings(form);
      const saved = formFromSettings(await dataAdapter.settings.update(patch));
      setInitial(saved);
      setForm(saved);
      await logActivity(user, {
        action: "settings.update",
        entityType: "settings",
        entityId: "company",
        entityLabel: saved.companyName,
        summary: `Updated company settings for ${saved.companyName}`,
        metadata: {
          currency: saved.currency,
          defaultTaxRate: saved.defaultTaxRate,
          defaultPaymentTerms: saved.defaultPaymentTerms,
        },
      });
      toast.success("Settings saved", "Company and document defaults are now updated.");
    } catch (error) {
      toast.error("Couldn't save settings", errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading settings...
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage company profile, document defaults, currency, tax, backups, and admin controls."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setForm(initial ?? DEFAULT_SETTINGS)}
              disabled={!dirty || saving}
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button type="button" onClick={saveSettings} disabled={!dirty || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save settings
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-brand-700" />
                Company profile
              </CardTitle>
              <CardDescription>
                This information is used for company identity and document defaults.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label="Company name *">
                <Input
                  value={form.companyName}
                  onChange={(event) => update("companyName", event.target.value)}
                  placeholder="Irmaan Trading Company"
                />
              </Field>
              <Field label="Tax ID / TIN">
                <Input
                  value={form.taxId ?? ""}
                  onChange={(event) => update("taxId", event.target.value)}
                  placeholder="TIN-7741200"
                />
              </Field>
              <Field label="Phone *">
                <Input
                  value={form.phone}
                  onChange={(event) => update("phone", event.target.value)}
                  placeholder="+252..."
                />
              </Field>
              <Field label="Email *">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(event) => update("email", event.target.value)}
                  placeholder="info@example.com"
                />
              </Field>
              <Field label="Address *" className="md:col-span-2">
                <Textarea
                  rows={3}
                  value={form.address}
                  onChange={(event) => update("address", event.target.value)}
                  placeholder="Business address"
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-brand-700" />
                Currency, tax, and terms
              </CardTitle>
              <CardDescription>
                These defaults are used when creating new sales orders, invoices, and purchase orders.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Currency">
                <Select value={form.currency} onChange={(event) => onCurrencyChange(event.target.value)}>
                  {CURRENCY_OPTIONS.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Currency symbol">
                <Input
                  value={form.currencySymbol}
                  onChange={(event) => update("currencySymbol", event.target.value)}
                  placeholder="$"
                />
              </Field>
              <Field label="Default tax %">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={Number((form.defaultTaxRate * 100).toFixed(4))}
                  onChange={(event) =>
                    update("defaultTaxRate", (Number(event.target.value) || 0) / 100)
                  }
                />
              </Field>
              <Field label="Payment terms days">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={form.defaultPaymentTerms}
                  onChange={(event) =>
                    update("defaultPaymentTerms", Number(event.target.value) || 0)
                  }
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-brand-700" />
                Document branding
              </CardTitle>
              <CardDescription>
                Add a logo and standard notes for invoices and customer-facing documents.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[180px_1fr]">
                <div className="rounded-lg border border-slate-200 bg-slate-50 min-h-36 flex items-center justify-center overflow-hidden">
                  {form.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.logo} alt="Company logo preview" className="max-h-32 max-w-full object-contain" />
                  ) : (
                    <div className="text-center text-slate-400 text-sm px-4">
                      <ImageIcon className="h-8 w-8 mx-auto mb-2" />
                      No logo selected
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <Field label="Logo URL or uploaded image">
                    <Input
                      value={form.logo ?? ""}
                      onChange={(event) => update("logo", event.target.value)}
                      placeholder="https://example.com/logo.png or upload below"
                    />
                  </Field>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="max-w-sm"
                      onChange={(event) => onLogoFile(event.target.files?.[0])}
                    />
                    {form.logo && (
                      <Button type="button" variant="outline" onClick={() => update("logo", "")}>
                        Remove logo
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Uploaded logos are stored as a small data URL in company settings. Keep the file
                    under 750 KB.
                  </p>
                </div>
              </div>
              <Field label="Invoice footer / payment instructions">
                <Textarea
                  rows={4}
                  value={form.invoiceFooter ?? ""}
                  onChange={(event) => update("invoiceFooter", event.target.value)}
                  placeholder="Bank details, payment instructions, terms and conditions..."
                />
              </Field>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>How the business identity currently reads.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-md bg-brand-50 border border-brand-100 flex items-center justify-center overflow-hidden">
                    {form.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={form.logo} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <Building2 className="h-5 w-5 text-brand-700" />
                    )}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">{form.companyName || "Company name"}</div>
                    <div className="text-xs text-slate-500">{form.email || "Email"} · {form.phone || "Phone"}</div>
                  </div>
                </div>
                <div className="mt-3 text-sm text-slate-600 whitespace-pre-line">
                  {form.address || "Address"}
                </div>
                {form.taxId && <div className="mt-2 text-xs text-slate-500">Tax ID: {form.taxId}</div>}
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="info">{form.currency}</Badge>
                <Badge variant="success">{form.currencySymbol} symbol</Badge>
                <Badge variant="warning">{(form.defaultTaxRate * 100).toFixed(2)}% tax</Badge>
                <Badge variant="muted">{form.defaultPaymentTerms} day terms</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-brand-700" />
                Admin tools
              </CardTitle>
              <CardDescription>Fast access to business-critical controls.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/users">
                  <Users className="h-4 w-4" />
                  Manage users
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/backups">
                  <DatabaseBackup className="h-4 w-4" />
                  Download backup
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/reports/reconciliation">
                  <FileText className="h-4 w-4" />
                  Reconciliation report
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Handover note</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600 space-y-2">
              <p>
                Give the customer an admin account. They can update business information here,
                manage users, and download backups without accessing the code.
              </p>
              <p>
                For stronger protection, keep Google Cloud scheduled Firestore backups enabled as
                the long-term disaster recovery layer.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
