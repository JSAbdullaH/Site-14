import type { StringLike } from '../types/Base';
import type { DefaultThresholdInput, D3Scale } from '../types/Scale';
import type { ScaleType } from '../types/ScaleConfig';
export default function inferScaleType<Output, DiscreteInput extends StringLike, ThresholdInput extends DefaultThresholdInput>(scale: D3Scale<Output, DiscreteInput, ThresholdInput>): ScaleType;
//# sourceMappingURL=inferScaleType.d.ts.map