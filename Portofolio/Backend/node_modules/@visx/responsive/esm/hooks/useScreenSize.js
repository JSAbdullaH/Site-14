import debounce from 'lodash/debounce';
import { useEffect, useMemo, useState } from 'react';
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
  const [screenSize, setScreenSize] = useState(initialSize);
  const handleResize = useMemo(() => debounce(() => {
    setScreenSize(() => ({
      width: window.innerWidth,
      height: window.innerHeight
    }));
  }, debounceTime, {
    leading: enableDebounceLeadingCall
  }), [debounceTime, enableDebounceLeadingCall]);
  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize, false);
    return () => {
      window.removeEventListener('resize', handleResize, false);
      handleResize.cancel();
    };
  }, [handleResize]);
  return screenSize;
};
export default useScreenSize;