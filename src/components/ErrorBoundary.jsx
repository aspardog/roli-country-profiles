import { Component } from 'react';
import PropTypes from 'prop-types';
import { COLORS, FONTS } from '../config';

const errorStyle = {
  maxWidth: 600,
  margin: '80px auto',
  padding: 32,
  fontFamily: FONTS.sans,
  textAlign: 'center',
};

const titleStyle = {
  fontSize: 24,
  fontWeight: 600,
  color: COLORS.ink,
  marginBottom: 16,
};

const messageStyle = {
  fontSize: 14,
  color: COLORS.muted,
  lineHeight: 1.6,
  marginBottom: 24,
};

const buttonStyle = {
  fontFamily: FONTS.sans,
  fontSize: 14,
  fontWeight: 500,
  color: COLORS.accentText,
  background: COLORS.accent,
  border: 'none',
  borderRadius: 6,
  padding: '10px 20px',
  cursor: 'pointer',
};

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={errorStyle} role="alert">
          <h1 style={titleStyle}>Something went wrong</h1>
          <p style={messageStyle}>
            An unexpected error occurred. Please try reloading the page.
          </p>
          <button style={buttonStyle} onClick={this.handleReload}>
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
};
