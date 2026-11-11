const SAR = new Intl.NumberFormat("en-SA", { style: "currency", currency: "SAR", minimumFractionDigits: 2 });
const SAR_SHORT = new Intl.NumberFormat("en-SA", { style: "currency", currency: "SAR", notation: "compact", maximumFractionDigits: 1 });

export const formatSar = (halalas: number) => SAR.format(halalas / 100);

export const formatSarShort = (halalas: number) => SAR_SHORT.format(halalas / 100);

export const toHalalas = (sar: string) => Math.round(Number(sar) * 100);
