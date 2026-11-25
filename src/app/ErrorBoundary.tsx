import React, { Component } from 'react';
import { AlertCircle } from 'lucide-react';
import { STORAGE_KEY } from '../store/AppContext';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'An unexpected rendering error occurred.' };
  }

  override render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="page-container">
        <div className="panel">
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="status-banner danger" role="alert">
              <AlertCircle size={20} aria-hidden="true" />
              <div>
                <strong>Something went wrong</strong>
                <p style={{ margin: '4px 0 0', fontSize: 13.5 }}>{this.state.message}</p>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => window.location.reload()}
              >
                Recover from last saved draft
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  try {
                    window.localStorage.removeItem(STORAGE_KEY);
                  } catch {
                    // ignore
                  }
                  window.location.href = '/';
                }}
              >
                Reset local draft &amp; return home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
