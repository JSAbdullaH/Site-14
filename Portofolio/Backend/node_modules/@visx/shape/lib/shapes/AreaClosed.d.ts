import type { PositionScale, AddSVGProps, BaseAreaProps } from '../types';
export type AreaClosedProps<Datum> = BaseAreaProps<Datum> & {
    yScale: PositionScale;
};
export default function AreaClosed<Datum>({ x, x0, x1, y, y1, y0, yScale, data, defined, className, curve, innerRef, children, ...restProps }: AddSVGProps<AreaClosedProps<Datum>, SVGPathElement>): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=AreaClosed.d.ts.map