"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/layout/Logo";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("admin@irmaan.co");
  const [password, setPassword] = useState("demo1234");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-brand-800 to-brand-950 text-white p-12">
        <Logo />
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">
            Run your trading operations with confidence.
          </h2>
          <p className="text-brand-100 mt-3 text-sm leading-relaxed">
            Issue delivery orders, manage inventory and bill customers — all from one place.
          </p>
        </div>
        <div className="text-xs text-brand-200">
          © {new Date().getFullYear()} Irmaan Trading Company
        </div>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-8 bg-white">
        <form onSubmit={onSubmit} className="w-full max-w-sm">
          <div className="lg:hidden mb-6"><Logo /></div>
          <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
          <p className="text-sm text-slate-500 mt-1">Welcome back. Please enter your details.</p>

          <div className="mt-8 space-y-4">
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="mb-0">Password</Label>
                <Link href="/forgot-password" className="text-xs text-brand-700 hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {err && <div className="text-sm text-red-600">{err}</div>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </div>


        </form>
      </div>
    </div>
  );
}
