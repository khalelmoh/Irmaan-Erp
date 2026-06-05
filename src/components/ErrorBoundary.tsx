"use client";

import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // In production you'd ship this to Sentry / LogRocket / etc.
    if (typeof window !== "undefined") {
      console.error("[ErrorBoundary]", error, info);
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-xl shadow-card border border-slate-200 p-6 text-center">
          <div className="h-12 w-12 mx-auto rounded-full bg-red-50 flex items-center justify-center mb-3">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
          <p className="text-sm text-slate-600 mt-2">
            The app hit an unexpected error and stopped. Your data is safe.
          </p>
          <details className="mt-3 text-left bg-slate-50 border border-slate-200 rounded-md p-2 text-xs">
            <summary className="cursor-pointer text-slate-700 font-medium">Technical details</summary>
            <pre className="mt-2 text-red-700 whitespace-pre-wrap break-words text-[11px]">
              {this.state.error.name}: {this.state.error.message}
            </pre>
          </details>
          <div className="mt-5 flex gap-2 justify-center">
            <button
              onClick={this.reset}
              className="inline-flex items-center gap-2 px-3 h-9 rounded-md bg-brand-700 text-white text-sm font-medium hover:bg-brand-800"
            >
              <RefreshCw className="h-4 w-4" /> Try again
            </button>
            <a
              href="/dashboard"
              className="inline-flex items-center gap-2 px-3 h-9 rounded-md border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50"
            >
              <Home className="h-4 w-4" /> Go to dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }
}
