export default function polarToCartesian(_ref) {
  let {
    radius,
    angle
  } = _ref;
  return {
    x: radius * Math.cos(angle),
    y: radius * Math.sin(angle)
  };
}