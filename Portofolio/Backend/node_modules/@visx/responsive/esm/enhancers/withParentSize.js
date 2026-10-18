import debounce from 'lodash/debounce';
import { Component } from 'react';
import { jsx as _jsx } from "react/jsx-runtime";
const CONTAINER_STYLES = {
  width: '100%',
  height: '100%'
};

/**
 * @deprecated
 * @TODO remove in the next major version - exported for backwards compatibility
 */

export default function withParentSize(BaseComponent, /** Optionally inject a ResizeObserver polyfill, else this *must* be globally available. */
resizeObserverPolyfill) {
  return class WrappedComponent extends Component {
    displayName = (() => `withParentSize(${BaseComponent.displayName ?? BaseComponent.name ?? 'Component'})`)();
    state = (() => ({
      parentWidth: undefined,
      parentHeight: undefined
    }))();
    animationFrameID = 0;
    container = null;
    componentDidMount() {
      const ResizeObserverLocal = resizeObserverPolyfill || window.ResizeObserver;
      this.resizeObserver = new ResizeObserverLocal(entries => {
        entries.forEach(entry => {
          const {
            width,
            height
          } = entry.contentRect;
          this.animationFrameID = window.requestAnimationFrame(() => {
            this.resize({
              width,
              height
            });
          });
        });
      });
      if (this.container) this.resizeObserver.observe(this.container);
    }
    componentWillUnmount() {
      window.cancelAnimationFrame(this.animationFrameID);
      if (this.resizeObserver) this.resizeObserver.disconnect();
      this.resize.cancel();
    }
    setRef = ref => {
      this.container = ref;
    };
    resize = (() => debounce(
    // eslint-disable-next-line unicorn/consistent-function-scoping
    _ref => {
      let {
        width,
        height
      } = _ref;
      this.setState({
        parentWidth: width,
        parentHeight: height
      });
    }, this.props.debounceTime ?? 300, {
      leading: this.props.enableDebounceLeadingCall ?? true
    }))();
    render() {
      const {
        initialWidth,
        initialHeight
      } = this.props;
      const {
        parentWidth = initialWidth,
        parentHeight = initialHeight
      } = this.state;
      return /*#__PURE__*/_jsx("div", {
        style: CONTAINER_STYLES,
        ref: this.setRef,
        children: parentWidth != null && parentHeight != null && /*#__PURE__*/_jsx(BaseComponent, {
          parentWidth: parentWidth,
          parentHeight: parentHeight,
          ...this.props
        })
      });
    }
  };
}