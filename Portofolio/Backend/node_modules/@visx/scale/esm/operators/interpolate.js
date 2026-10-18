import createColorInterpolator from '../utils/createColorInterpolator';
export default function applyInterpolate(scale, config) {
  if ('interpolate' in config && 'interpolate' in scale && typeof config.interpolate !== 'undefined') {
    const interpolator = createColorInterpolator(config.interpolate);
    scale.interpolate(interpolator);
  }
}