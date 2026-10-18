import type { SVGProps } from 'react';
import type { LineProps } from '@visx/shape';
import type { ScaleInput } from '@visx/scale';
import type { CommonGridProps, GridScale } from '../types';
export type GridRowsProps<Scale extends GridScale> = CommonGridProps & {
    /** `@visx/scale` or `d3-scale` object used to convert value to position. */
    scale: Scale;
    /**
     * Exact values used to generate grid lines using `scale`.
     * Overrides `numTicks` if specified.
     */
    tickValues?: ScaleInput<Scale>[];
    /** Total width of each grid row line. */
    width: number;
};
export type AllGridRowsProps<Scale extends GridScale> = GridRowsProps<Scale> & Omit<LineProps & Omit<SVGProps<SVGLineElement>, keyof LineProps>, keyof GridRowsProps<Scale>>;
export default function GridRows<Scale extends GridScale>({ top, left, scale, width, stroke, strokeWidth, strokeDasharray, className, children, numTicks, lineStyle, offset, tickValues, ...restProps }: AllGridRowsProps<Scale>): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=GridRows.d.ts.map