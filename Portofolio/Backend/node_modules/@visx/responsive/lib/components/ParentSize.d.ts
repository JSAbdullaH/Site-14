import type { CSSProperties, ReactNode, HTMLAttributes } from 'react';
import type { ParentSizeState, UseParentSizeConfig } from '../hooks/useParentSize';
export type ParentSizeProvidedProps = ParentSizeState & {
    ref: HTMLDivElement | null;
    resize: (state: ParentSizeState) => void;
};
export type ParentSizeProps = {
    /** Optional `className` to add to the parent `div` wrapper used for size measurement. */
    className?: string;
    /**
     * @deprecated - use `style` prop as all other props are passed directly to the parent `div`.
     * @TODO remove in the next major version.
     * Optional `style` object to apply to the parent `div` wrapper used for size measurement.
     * */
    parentSizeStyles?: CSSProperties;
    /** Child render function `({ width, height, top, left, ref, resize }) => ReactNode`. */
    children: (args: ParentSizeProvidedProps) => ReactNode;
} & UseParentSizeConfig;
export default function ParentSize({ className, children, debounceTime, ignoreDimensions, initialSize, parentSizeStyles, enableDebounceLeadingCall, resizeObserverPolyfill, ...restProps }: ParentSizeProps & Omit<HTMLAttributes<HTMLDivElement>, keyof ParentSizeProps>): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=ParentSize.d.ts.map