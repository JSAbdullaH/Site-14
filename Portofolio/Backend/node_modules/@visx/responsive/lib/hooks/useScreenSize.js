"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _debounce = _interopRequireDefault(require("lodash/debounce"));
var _react = require("react");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const defaultInitialSize = {
  width: 0,
  height: 0
};
const useScreenSize = function () {
  let {
    initialSize = defaultInitialSize,
    debounceTime = 300,
    enableDebounceLeadingCall = true
  } = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  const [screenSize, setScreenSize] = (0, _react.useState)(initialSize);
  const handleResize = (0, _react.useMemo)(() => (0, _debounce.default)(() => {
    setScreenSize(() => ({
      width: window.innerWidth,
      height: window.innerHeight
    }));
  }, debounceTime, {
    leading: enableDebounceLeadingCall
  }), [debounceTime, enableDebounceLeadingCall]);
  (0, _react.useEffect)(() => {
    handleResize();
    window.addEventListener('resize', handleResize, false);
    return () => {
      window.removeEventListener('resize', handleResize, false);
      handleResize.cancel();
    };
  }, [handleResize]);
  return screenSize;
};
var _default = exports.default = useScreenSize;