import { scaleSqrt } from '@visx/vendor/d3-scale';
import scaleOperator from '../operators/scaleOperator';
export const updateSqrtScale = scaleOperator('domain', 'range', 'reverse', 'clamp', 'interpolate', 'nice', 'round', 'zero');
export default function createSqrtScale(config) {
  return updateSqrtScale(scaleSqrt(), config);
}