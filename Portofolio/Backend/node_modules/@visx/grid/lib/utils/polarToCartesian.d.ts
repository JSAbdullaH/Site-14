export type PolarCoordinate = {
    radius: number;
    angle: number;
};
export type CartesianCoordinate = {
    x: number;
    y: number;
};
export default function polarToCartesian({ radius, angle }: PolarCoordinate): CartesianCoordinate;
//# sourceMappingURL=polarToCartesian.d.ts.map