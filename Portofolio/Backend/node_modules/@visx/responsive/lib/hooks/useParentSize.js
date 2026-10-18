"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = useParentSize;
var _debounce = _interopRequireDefault(require("lodash/debounce"));
var _react = require("react");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const defaultIgnoreDimensions = [];
const defaultInitialSize = {
  width: 0,
  height: 0,
  top: 0,
  left: 0
};
function useParentSize() {
  let {
    initialSize = defaultInitialSize,
    debounceTime = 300,
    ignoreDimensions = defaultIgnoreDimensions,
    enableDebounceLeadingCall = true,
    resizeObserverPolyfill
  } = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  const parentRef = (0, _react.useRef)(null);
  const animationFrameID = (0, _react.useRef)(0);
  const [state, setState] = (0, _react.useState)({
    ...defaultInitialSize,
    ...initialSize
  });
  const resize = (0, _react.useMemo)(() => {
    const normalized = Array.isArray(ignoreDimensions) ? ignoreDimensions : [ignoreDimensions];
    return (0, _debounce.default)(incoming => {
      setState(existing => {
        const stateKeys = Object.keys(existing);
        const keysWithChanges = stateKeys.filter(key => existing[key] !== incoming[key]);
        const shouldBail = keysWithChanges.every(key => normalized.includes(key));
        return shouldBail ? existing : incoming;
      });
    }, debounceTime, {
      leading: enableDebounceLeadingCall
    });
  }, [debounceTime, enableDebounceLeadingCall, ignoreDimensions]);
  (0, _react.useEffect)(() => {
    const LocalResizeObserver = resizeObserverPolyfill || window.ResizeObserver;
    const observer = new LocalResizeObserver(entries => {
      entries.forEach(entry => {
        const {
          left,
          top,
          width,
          height
        } = entry?.contentRect ?? {};
        animationFrameID.current = window.requestAnimationFrame(() => {
          resize({
            width,
            height,
            top,
            left
          });
        });
      });
    });
    if (parentRef.current) observer.observe(parentRef.current);
    return () => {
      window.cancelAnimationFrame(animationFrameID.current);
      observer.disconnect();
      resize.cancel();
    };
  }, [resize, resizeObserverPolyfill]);
  return {
    parentRef,
    resize,
    ...state
  };
}