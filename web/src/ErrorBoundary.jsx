import React from "react";

export default class ErrorBoundary extends React.Component {
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
        <div style={{
          minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
          background: "#f0f2f5", fontFamily: "system-ui, sans-serif",
        }}>
          <div style={{
            background: "#fff", borderRadius: 16, padding: "40px 36px", width: 400,
            textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 600 }}>Something went wrong</h2>
            <p style={{ color: "#666", fontSize: 14, margin: "0 0 20px" }}>
              {this.state.error.message || "An unexpected error occurred."}
            </p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.reload(); }}
              style={{
                padding: "10px 24px", borderRadius: 8, border: "none",
                background: "#e74c3c", color: "#fff", fontSize: 14, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
