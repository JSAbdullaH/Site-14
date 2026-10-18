import type { ReactNode } from 'react';
import type { Arc as ArcType, PieArcDatum as PieArcDatumType, Pie as PieType } from '@visx/vendor/d3-shape';
import type { $TSFIXME, AddSVGProps, ArcPathConfig, PiePathConfig } from '../types';
export type PieArcDatum<Datum> = PieArcDatumType<Datum>;
type StringAccessor<Datum> = (pieArcDatum: PieArcDatum<Datum>) => string;
export type ProvidedProps<Datum> = {
    path: ArcType<$TSFIXME, PieArcDatum<Datum>>;
    arcs: PieArcDatum<Datum>[];
    pie: PieType<$TSFIXME, Datum>;
};
export type PieProps<Datum> = {
    /** className applied to path element. */
    className?: string;
    /** Top offset of rendered Pie. */
    top?: number;
    /** Left offset of rendered Pie. */
    left?: number;
    /** Array of data to generate a Pie for. */
    data?: Datum[];
    /** Optional render function invoked for each Datum to render something (e.g., a Label) at each pie centroid. */
    centroid?: (xyCoords: [number, number], arc: PieArcDatum<Datum>) => ReactNode;
    /** Invoked for each datum, returns the value for a given Pie segment/arc datum. */
    pieValue?: PiePathConfig<Datum>['value'];
    /** Comparator function to sort *arcs*, overridden by pieSortValues if defined. If pieSort and pieSortValues are null, arcs match input data order. */
    pieSort?: PiePathConfig<Datum>['sort'];
    /** Comparator function to sort arc *values*, overrides pieSort if defined. If pieSort and pieSortValues are null, arcs match input data order. */
    pieSortValues?: PiePathConfig<Datum>['sortValues'];
    /** Render function override which is passed the configured arc generator as input. */
    children?: (provided: ProvidedProps<Datum>) => ReactNode;
    /** Optional accessor function to return the fill string value of a given arc. */
    fill?: string | StringAccessor<Datum>;
} & Pick<PiePathConfig<Datum>, 'startAngle' | 'endAngle' | 'padAngle'> & Pick<ArcPathConfig<PieArcDatum<Datum>>, 'innerRadius' | 'outerRadius' | 'cornerRadius' | 'padRadius'>;
export default function Pie<Datum>({ className, top, left, data, centroid, innerRadius, outerRadius, cornerRadius, startAngle, endAngle, padAngle, padRadius, pieSort, pieSortValues, pieValue, children, fill, ...restProps }: AddSVGProps<PieProps<Datum>, SVGPathElement>): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=Pie.d.ts.map