"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { clientLogger } from "@/lib/core/logger/client";

interface ReaderErrorBoundaryProps {
  /** Identity of what's rendered — a new value clears a previous crash. */
  resetKey: string;
  children: ReactNode;
}

interface ReaderErrorBoundaryState {
  error: Error | null;
  resetKey: string;
}

/**
 * Contains a reader crash to the reader tab: the rest of the workspace keeps
 * working, "Try again" remounts just the reader, and the error is logged with
 * its component stack so it can be diagnosed instead of forcing a full reload.
 */
export class ReaderErrorBoundary extends Component<ReaderErrorBoundaryProps, ReaderErrorBoundaryState> {
  state: ReaderErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<ReaderErrorBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(
    props: ReaderErrorBoundaryProps,
    state: ReaderErrorBoundaryState
  ): Partial<ReaderErrorBoundaryState> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    clientLogger.error({
      layer: "ui",
      event: "reader:crashed",
      summary: `reader crashed: ${error.message}`,
      error,
      attrs: { reset_key: this.props.resetKey, component_stack: info.componentStack?.slice(0, 2000) ?? "" },
    });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md space-y-3 text-center">
          <AlertTriangle className="mx-auto h-7 w-7 text-amber-500" />
          <p className="text-sm font-medium">The reader hit an error.</p>
          <p className="break-words text-xs text-muted-foreground">{error.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="inline-flex h-8 items-center gap-1 rounded bg-primary px-3 text-xs font-medium text-primary-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      </div>
    );
  }
}
