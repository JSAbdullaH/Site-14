import { stackOffsetExpand, stackOffsetDiverging, stackOffsetNone, stackOffsetSilhouette, stackOffsetWiggle } from '@visx/vendor/d3-shape';
export declare const STACK_OFFSETS: {
    readonly expand: typeof stackOffsetExpand;
    readonly diverging: typeof stackOffsetDiverging;
    readonly none: typeof stackOffsetNone;
    readonly silhouette: typeof stackOffsetSilhouette;
    readonly wiggle: typeof stackOffsetWiggle;
};
export type StackOffset = keyof typeof STACK_OFFSETS;
export declare const STACK_OFFSET_NAMES: StackOffset[];
export default function stackOffset(offset?: keyof typeof STACK_OFFSETS): typeof stackOffsetExpand;
//# sourceMappingURL=stackOffset.d.ts.map