import type { DefaultThresholdInput, PickD3Scale } from '../types/Scale';
import type { ScaleType, PickScaleConfigWithoutType } from '../types/ScaleConfig';
import type { DefaultOutput, StringLike } from '../types/Base';
/**
 * List of all operators, in order of execution
 */
export declare const ALL_OPERATORS: readonly ["domain", "nice", "zero", "interpolate", "round", "range", "reverse", "align", "base", "clamp", "constant", "exponent", "padding", "unknown"];
type OperatorType = (typeof ALL_OPERATORS)[number];
export default function scaleOperator<T extends ScaleType>(...ops: OperatorType[]): <Output = DefaultOutput, DiscreteInput extends StringLike = StringLike, ThresholdInput extends DefaultThresholdInput = DefaultThresholdInput>(scale: PickD3Scale<T, Output, DiscreteInput, ThresholdInput>, config?: PickScaleConfigWithoutType<T, Output, DiscreteInput, ThresholdInput>) => PickD3Scale<T, Output, DiscreteInput, ThresholdInput>;
export {};
//# sourceMappingURL=scaleOperator.d.ts.map