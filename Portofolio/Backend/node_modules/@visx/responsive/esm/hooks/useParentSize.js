import debounce from 'lodash/debounce';
import { useEffect, useMemo, useRef, useState } from 'react';
const defaultIgnoreDimensions = [];
const defaultInitialSize = {
  width: 0,
  height: 0,
  top: 0,
  left: 0
};
export default function useParentSize() {
  let {
    initialSize = defaultInitialSize,
    debounceTime = 300,
    ignoreDimensions = defaultIgnoreDimensions,
    enableDebounceLeadingCall = true,
    resizeObserverPolyfill
  } = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  const parentRef = useRef(null);
  const animationFrameID = useRef(0);
  const [state, setState] = useState({
    ...defaultInitialSize,
    ...initialSize
  });
  const resize = useMemo(() => {
    const normalized = Array.isArray(ignoreDimensions) ? ignoreDimensions : [ignoreDimensions];
    return debounce(incoming => {
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
  useEffect(() => {
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