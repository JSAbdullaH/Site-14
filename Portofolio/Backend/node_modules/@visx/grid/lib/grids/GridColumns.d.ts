import type { SVGProps } from 'react';
import type { LineProps } from '@visx/shape';
import type { ScaleInput } from '@visx/scale';
import type { CommonGridProps, GridScale } from '../types';
export type GridColumnsProps<Scale extends GridScale> = CommonGridProps & {
    /** `@visx/scale` or `d3-scale` object used to convert value to position. */
    scale: Scale;
    /**
     * Exact values used to generate grid lines using `scale`.
     * Overrides `numTicks` if specified.
     */
    tickValues?: ScaleInput<Scale>[];
    /** Total height of each grid column line. */
    height: number;
};
export type AllGridColumnsProps<Scale extends GridScale> = GridColumnsProps<Scale> & Omit<LineProps & Omit<SVGProps<SVGLineElement>, keyof LineProps>, keyof GridColumnsProps<Scale>>;
export default function GridColumns<Scale extends GridScale>({ top, left, scale, height, stroke, strokeWidth, strokeDasharray, className, numTicks, lineStyle, offset, tickValues, children, ...restProps }: AllGridColumnsProps<Scale>): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=GridColumns.d.ts.map