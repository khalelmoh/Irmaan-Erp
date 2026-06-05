"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/layout/Logo";
import { Loader2, CheckCircle2, ArrowLeft, Mail } from "lucide-react";

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (e: unknown) {
      // For privacy, real Firebase shouldn't reveal whether an account exists.
      // The mock adapter does (to help debugging). Production: always show success.
      setErr(e instanceof Error ? e.message : "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-brand-800 to-brand-950 text-white p-12">
        <Logo />
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">Forgot your password?</h2>
          <p className="text-brand-100 mt-3 text-sm leading-relaxed">
            Enter your email and we'll send you a secure link to reset it.
          </p>
        </div>
        <div className="text-xs text-brand-200">
          © {new Date().getFullYear()} Irmaan Trading Company
        </div>
      </div>

      <div className="flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-6"><Logo /></div>

          {sent ? (
            <div className="text-center">
              <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="h-7 w-7 text-emerald-700" />
              </div>
              <h1 className="text-2xl font-semibold text-slate-900">Check your inbox</h1>
              <p className="text-sm text-slate-600 mt-2">
                If an account exists for <strong>{email}</strong>, we've sent a password reset link.
                Click it to choose a new password.
              </p>
              <div className="mt-6 p-3 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-600 text-left">
                <div className="font-medium text-slate-700 mb-1 flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" /> Didn't get the email?
                </div>
                <ul className="space-y-1 pl-4 list-disc">
                  <li>Check your spam / junk folder</li>
                  <li>Make sure the email matches what's on file</li>
                  <li>Contact your admin if you still can't access it</li>
                </ul>
              </div>
              <Button asChild variant="outline" className="mt-6 w-full">
                <Link href="/login">
                  <ArrowLeft className="h-4 w-4" /> Back to sign in
                </Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit}>
              <h1 className="text-2xl font-semibold text-slate-900">Reset your password</h1>
              <p className="text-sm text-slate-500 mt-1">
                We'll email you a link to choose a new one.
              </p>

              <div className="mt-8 space-y-4">
                <div>
                  <Label>Email address</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoFocus
                  />
                </div>
                {err && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">{err}</div>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Send reset link
                </Button>
              </div>

              <div className="mt-6 text-center">
                <Link href="/login" className="text-sm text-brand-700 hover:underline inline-flex items-center gap-1">
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
                </Link>
              </div>

              <div className="mt-8 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md p-3">
                <div className="font-medium text-slate-700 mb-1">Demo mode note</div>
                <div>
                  In this preview, no email is actually sent — the action is just recorded.
                  When you wire up Firebase, real reset emails will be delivered via Firebase Auth.
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
