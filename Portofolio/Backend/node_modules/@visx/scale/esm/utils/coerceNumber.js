export default function coerceNumber(val) {
  if ((typeof val === 'function' || typeof val === 'object' && !!val) && 'valueOf' in val) {
    const num = val.valueOf();
    if (typeof num === 'number') return num;
  }
  return val;
}