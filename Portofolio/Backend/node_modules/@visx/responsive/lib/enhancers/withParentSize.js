"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = withParentSize;
var _debounce = _interopRequireDefault(require("lodash/debounce"));
var _react = require("react");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const CONTAINER_STYLES = {
  width: '100%',
  height: '100%'
};

/**
 * @deprecated
 * @TODO remove in the next major version - exported for backwards compatibility
 */

function withParentSize(BaseComponent, /** Optionally inject a ResizeObserver polyfill, else this *must* be globally available. */
resizeObserverPolyfill) {
  return class WrappedComponent extends _react.Component {
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
    resize = (() => (0, _debounce.default)(
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
      return /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        style: CONTAINER_STYLES,
        ref: this.setRef,
        children: parentWidth != null && parentHeight != null && /*#__PURE__*/(0, _jsxRuntime.jsx)(BaseComponent, {
          parentWidth: parentWidth,
          parentHeight: parentHeight,
          ...this.props
        })
      });
    }
  };
}