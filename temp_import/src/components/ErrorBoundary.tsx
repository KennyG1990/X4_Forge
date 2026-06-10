/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  /** Short label for the area being guarded, e.g. "Source Control". */
  label?: string;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Catches render-time crashes in a subtree so a single broken panel shows a
 * recoverable fallback instead of white-screening the entire application.
 */
export default class ErrorBoundary extends (React.Component as any) {
  props: Readonly<ErrorBoundaryProps>;
  state: ErrorBoundaryState;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error?.message || 'Unknown render error.' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? ` · ${this.props.label}` : ''}]`, error, info);
  }

  handleReset = () => {
    (this as any).setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center bg-[#0a0c10] text-slate-300">
          <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
          <h3 className="font-mono font-bold text-sm text-white uppercase tracking-wide">
            {this.props.label ? `${this.props.label} hit an error` : 'This panel hit an error'}
          </h3>
          <p className="text-[11px] text-slate-400 font-mono mt-2 max-w-md leading-relaxed break-words">
            {this.state.message}
          </p>
          <p className="text-[10px] text-slate-500 mt-2 max-w-md leading-relaxed">
            The rest of the studio is still usable. Try again, or switch panels.
          </p>
          <button
            onClick={this.handleReset}
            className="mt-4 px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-cyan-300 rounded text-[11px] font-mono font-bold uppercase flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
