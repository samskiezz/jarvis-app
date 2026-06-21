import { Component } from 'react';

/**
 * Wraps one lazily-mounted overnight panel. A panel that throws during render is contained here
 * and shown as a small inline notice instead of crashing the whole app. This is what makes it safe
 * to expose ~109 loop-generated panels behind the launcher: any individual dud fails in isolation.
 */
export default class PanelErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            position: 'fixed', bottom: 72, left: 16, zIndex: 100000,
            maxWidth: 360, padding: '10px 14px', borderRadius: 10,
            background: 'rgba(20,8,8,0.92)', border: '1px solid rgba(255,90,90,0.45)',
            color: '#ffd0d0', font: '12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
            backdropFilter: 'blur(8px)',
          }}
        >
          <strong>{this.props.label || 'Panel'}</strong> failed to render.
          <button
            onClick={this.props.onClose}
            style={{
              marginLeft: 10, background: 'transparent', border: '1px solid rgba(255,120,120,0.5)',
              color: '#ffd0d0', borderRadius: 6, cursor: 'pointer', padding: '2px 8px',
            }}
          >
            dismiss
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
