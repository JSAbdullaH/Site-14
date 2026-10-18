import type { DebounceSettings } from '../types/index';
interface ScreenSize {
    width: number;
    height: number;
}
export type UseScreenSizeConfig = {
    /** Initial size before measuring the screen. */
    initialSize?: ScreenSize;
} & DebounceSettings;
declare const useScreenSize: ({ initialSize, debounceTime, enableDebounceLeadingCall, }?: UseScreenSizeConfig) => ScreenSize;
export default useScreenSize;
//# sourceMappingURL=useScreenSize.d.ts.map