import { scalePow } from '@visx/vendor/d3-scale';
import scaleOperator from '../operators/scaleOperator';
export const updatePowScale = scaleOperator('domain', 'range', 'reverse', 'clamp', 'exponent', 'interpolate', 'nice', 'round', 'zero');
export default function createPowScale(config) {
  return updatePowScale(scalePow(), config);
}