import type { SVGProps } from 'react';
import type { LineProps } from '@visx/shape';
import type { ScaleInput } from '@visx/scale';
import type { CommonGridProps, GridScale } from '../types';
export type GridAngleProps<Scale extends GridScale> = CommonGridProps & {
    /** `@visx/scale` or `d3-scale` object used to convert value to angle. */
    scale: Scale;
    /**
     * Exact values used to generate angle grid lines using `scale`.
     * Overrides `numTicks` if specified.
     */
    tickValues?: ScaleInput<Scale>[];
    /**
     * Radius which determines the start position of angle lines.
     */
    innerRadius?: number;
    /**
     * Radius which determines the end position of angle lines.
     */
    outerRadius: number;
    /**
     * The class name applied to all angle lines.
     */
    lineClassName?: string;
};
export type AllGridAngleProps<Scale extends GridScale> = GridAngleProps<Scale> & Omit<LineProps & Omit<SVGProps<SVGLineElement>, keyof LineProps | 'children'>, keyof GridAngleProps<Scale>>;
export default function GridAngle<Scale extends GridScale>({ className, innerRadius, left, lineClassName, lineStyle, numTicks, outerRadius, scale, stroke, strokeDasharray, strokeWidth, tickValues, top, children, // Explicitly extract children so it doesn't get spread to Line
...restProps }: AllGridAngleProps<Scale>): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=GridAngle.d.ts.map