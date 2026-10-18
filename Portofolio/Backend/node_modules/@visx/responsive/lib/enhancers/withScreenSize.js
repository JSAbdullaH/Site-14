"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = withScreenSize;
var _debounce = _interopRequireDefault(require("lodash/debounce"));
var _react = require("react");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * @deprecated
 * @TODO remove in the next major version - exported for backwards compatibility
 */

function withScreenSize(BaseComponent) {
  return class WrappedComponent extends _react.Component {
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
    resize = (() => (0, _debounce.default)(
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
      return screenWidth == null || screenHeight == null ? null : /*#__PURE__*/(0, _jsxRuntime.jsx)(BaseComponent, {
        screenWidth: screenWidth,
        screenHeight: screenHeight,
        ...this.props
      });
    }
  };
}