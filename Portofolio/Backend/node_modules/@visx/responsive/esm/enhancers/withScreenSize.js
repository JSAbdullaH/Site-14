import debounce from 'lodash/debounce';
import { Component } from 'react';

/**
 * @deprecated
 * @TODO remove in the next major version - exported for backwards compatibility
 */
import { jsx as _jsx } from "react/jsx-runtime";
export default function withScreenSize(BaseComponent) {
  return class WrappedComponent extends Component {
    displayName = (() => `withScreenSize(${BaseComponent.displayName ?? BaseComponent.name ?? 'Component'})`)();
    state = (() => ({
      screenWidth: undefined,
      screenHeight: undefined
    }))();
    componentDidMount() {
      window.addEventListener('resize', this.resize, false);
      this.resize();
    }
    componentWillUnmount() {
      window.removeEventListener('resize', this.resize, false);
      this.resize.cancel();
    }
    resize = (() => debounce(
    // eslint-disable-next-line unicorn/consistent-function-scoping
    () => {
      this.setState((/** prevState, props */
      ) => ({
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight
      }));
    }, this.props.debounceTime ?? this.props.windowResizeDebounceTime ?? 300, {
      leading: this.props.enableDebounceLeadingCall ?? true
    }))();
    render() {
      const {
        screenWidth,
        screenHeight
      } = this.state;
      return screenWidth == null || screenHeight == null ? null : /*#__PURE__*/_jsx(BaseComponent, {
        screenWidth: screenWidth,
        screenHeight: screenHeight,
        ...this.props
      });
    }
  };
}