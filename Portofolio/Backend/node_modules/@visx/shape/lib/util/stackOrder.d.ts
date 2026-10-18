import { stackOrderAscending, stackOrderDescending, stackOrderInsideOut, stackOrderNone, stackOrderReverse } from '@visx/vendor/d3-shape';
export declare const STACK_ORDERS: {
    readonly ascending: typeof stackOrderAscending;
    readonly descending: typeof stackOrderDescending;
    readonly insideout: typeof stackOrderInsideOut;
    readonly none: typeof stackOrderNone;
    readonly reverse: typeof stackOrderReverse;
};
export type StackOrder = keyof typeof STACK_ORDERS;
export declare const STACK_ORDER_NAMES: StackOrder[];
export default function stackOrder(order?: keyof typeof STACK_ORDERS): typeof stackOrderAscending;
//# sourceMappingURL=stackOrder.d.ts.map