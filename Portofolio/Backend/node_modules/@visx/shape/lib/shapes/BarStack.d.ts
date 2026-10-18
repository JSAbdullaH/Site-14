import type { SeriesPoint } from '@visx/vendor/d3-shape';
import type { ScaleInput } from '@visx/scale';
import type { PositionScale, AddSVGProps, BaseBarStackProps, StackKey, Accessor } from '../types';
export type BarStackProps<Datum, Key extends StackKey = StackKey, XScale extends PositionScale = PositionScale, YScale extends PositionScale = PositionScale> = BaseBarStackProps<Datum, Key, XScale, YScale> & {
    /** Returns the value mapped to the x of a bar. */
    x: Accessor<Datum, ScaleInput<XScale>>;
    /** Returns the value mapped to the y0 of a bar. */
    y0?: Accessor<SeriesPoint<Datum>, ScaleInput<YScale>>;
    /** Returns the value mapped to the y1 of a bar. */
    y1?: Accessor<SeriesPoint<Datum>, ScaleInput<YScale>>;
};
export default function BarStack<Datum, Key extends StackKey = StackKey, XScale extends PositionScale = PositionScale, YScale extends PositionScale = PositionScale>({ data, className, top, left, x, y0, y1, xScale, yScale, color, keys, value, order, offset, children, ...restProps }: AddSVGProps<BarStackProps<Datum, Key, XScale, YScale>, SVGRectElement>): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=BarStack.d.ts.map