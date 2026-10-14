import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught application error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    const userRaw = localStorage.getItem('anfaal-user');
    let target = '/';
    try {
      if (userRaw) {
        const u = JSON.parse(userRaw);
        if (u.role === 'ADMIN') target = '/admin';
        else if (u.role === 'MENTEE') target = '/mentee';
        else if (u.role === 'MENTOR') target = '/mentor';
      }
    } catch {
      target = '/';
    }
    window.location.href = target;
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-wrapper" role="alert">
          <div className="error-boundary-card">
            <div className="error-boundary-icon">
              <AlertCircle size={32} />
            </div>
            <h2 className="error-boundary-title">
              {this.props.fallbackTitle || 'Something went wrong.'}
            </h2>
            <p className="error-boundary-message">
              {this.props.fallbackMessage ||
                'An unexpected error occurred while displaying this page. Your data is safe.'}
            </p>
            <div className="error-boundary-actions">
              <button
                type="button"
                className="btn-primary error-boundary-btn"
                onClick={this.handleReset}
              >
                <RefreshCw size={16} />
                <span>Try again</span>
              </button>
              <button
                type="button"
                className="btn-secondary error-boundary-btn"
                onClick={this.handleGoHome}
              >
                <Home size={16} />
                <span>Return to Dashboard</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
