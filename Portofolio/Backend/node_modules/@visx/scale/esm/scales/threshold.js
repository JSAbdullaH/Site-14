import { scaleThreshold } from '@visx/vendor/d3-scale';
import scaleOperator from '../operators/scaleOperator';
export const updateThresholdScale = scaleOperator('domain', 'range', 'reverse');
export default function createThresholdScale(config) {
  return updateThresholdScale(scaleThreshold(), config);
}