import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm font-semibold text-red-600">Something went wrong</p>
          <p className="text-xs text-surface-muted">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="rounded-lg bg-accent-500 px-4 py-2 text-xs font-semibold text-white"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
