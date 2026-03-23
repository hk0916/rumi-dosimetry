/**
 * 6종 스무딩 필터 구현
 * 입력: voltage[] 배열, windowSize
 * 출력: smoothed voltage[] 배열
 */

export type FilterType =
  | "median"
  | "arithmetic_mean"
  | "geometric_mean"
  | "least_square"
  | "envelope"
  | "bezier";

/** Median Filter */
function medianFilter(data: number[], windowSize: number): number[] {
  const half = Math.floor(windowSize / 2);
  return data.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(data.length, i + half + 1);
    const window = data.slice(start, end).sort((a, b) => a - b);
    return window[Math.floor(window.length / 2)];
  });
}

/** Arithmetic Mean (Moving Average) Filter */
function arithmeticMeanFilter(data: number[], windowSize: number): number[] {
  const half = Math.floor(windowSize / 2);
  return data.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(data.length, i + half + 1);
    const window = data.slice(start, end);
    return window.reduce((sum, v) => sum + v, 0) / window.length;
  });
}

/** Geometric Mean Filter */
function geometricMeanFilter(data: number[], windowSize: number): number[] {
  const half = Math.floor(windowSize / 2);
  return data.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(data.length, i + half + 1);
    const window = data.slice(start, end).map((v) => Math.max(v, 0.001)); // 0 방지
    const logSum = window.reduce((sum, v) => sum + Math.log(v), 0);
    return Math.exp(logSum / window.length);
  });
}

/** Least Square (Moving Polynomial Regression, degree=1) Filter */
function leastSquareFilter(data: number[], windowSize: number): number[] {
  const half = Math.floor(windowSize / 2);
  return data.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(data.length, i + half + 1);
    const window = data.slice(start, end);
    const n = window.length;

    // Linear regression: y = ax + b, evaluate at center
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let j = 0; j < n; j++) {
      sumX += j;
      sumY += window[j];
      sumXY += j * window[j];
      sumX2 += j * j;
    }

    const denom = n * sumX2 - sumX * sumX;
    if (Math.abs(denom) < 1e-10) return sumY / n;

    const a = (n * sumXY - sumX * sumY) / denom;
    const b = (sumY - a * sumX) / n;
    const centerIdx = i - start;
    return a * centerIdx + b;
  });
}

/** Envelope Filter (upper+lower envelope average) */
function envelopeFilter(data: number[], windowSize: number): number[] {
  const half = Math.floor(windowSize / 2);

  const upper = data.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(data.length, i + half + 1);
    return Math.max(...data.slice(start, end));
  });

  const lower = data.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(data.length, i + half + 1);
    return Math.min(...data.slice(start, end));
  });

  return data.map((_, i) => (upper[i] + lower[i]) / 2);
}

/** Bezier Filter (cubic Bezier curve smoothing) */
function bezierFilter(data: number[], windowSize: number): number[] {
  if (data.length < 4) return [...data];

  // Downsample control points, then interpolate with cubic Bezier
  const step = Math.max(1, Math.floor(windowSize / 2));
  const controlPoints: { idx: number; val: number }[] = [];

  for (let i = 0; i < data.length; i += step) {
    controlPoints.push({ idx: i, val: data[i] });
  }
  if (controlPoints[controlPoints.length - 1].idx !== data.length - 1) {
    controlPoints.push({ idx: data.length - 1, val: data[data.length - 1] });
  }

  const result = new Array(data.length);

  // For each segment of 4 control points, compute cubic Bezier
  for (let seg = 0; seg < controlPoints.length - 1; seg++) {
    const p0 = controlPoints[Math.max(0, seg - 1)];
    const p1 = controlPoints[seg];
    const p2 = controlPoints[Math.min(controlPoints.length - 1, seg + 1)];
    const p3 = controlPoints[Math.min(controlPoints.length - 1, seg + 2)];

    const startIdx = p1.idx;
    const endIdx = p2.idx;
    const segLen = endIdx - startIdx;
    if (segLen <= 0) continue;

    for (let i = startIdx; i <= endIdx; i++) {
      const t = segLen > 0 ? (i - startIdx) / segLen : 0;
      const t2 = t * t;
      const t3 = t2 * t;
      const mt = 1 - t;
      const mt2 = mt * mt;
      const mt3 = mt2 * mt;

      // Catmull-Rom to Bezier conversion for smooth interpolation
      const v = mt3 * p1.val + 3 * mt2 * t * (p1.val + (p2.val - p0.val) / 6) +
        3 * mt * t2 * (p2.val - (p3.val - p1.val) / 6) + t3 * p2.val;
      result[i] = v;
    }
  }

  // Fill any gaps
  for (let i = 0; i < data.length; i++) {
    if (result[i] === undefined) result[i] = data[i];
  }

  return result;
}

/** Apply smoothing filter */
export function applyFilter(
  data: number[],
  filterType: FilterType,
  windowSize: number
): number[] {
  const ws = Math.max(3, Math.min(windowSize, data.length));

  switch (filterType) {
    case "median":
      return medianFilter(data, ws);
    case "arithmetic_mean":
      return arithmeticMeanFilter(data, ws);
    case "geometric_mean":
      return geometricMeanFilter(data, ws);
    case "least_square":
      return leastSquareFilter(data, ws);
    case "envelope":
      return envelopeFilter(data, ws);
    case "bezier":
      return bezierFilter(data, ws);
    default:
      return [...data];
  }
}

/**
 * 누적선량 계산: ∫(start→end) [smoothed_voltage - baseline] dt
 * timestamps: ms 단위의 Date 배열
 * voltages: smoothed voltage 배열
 * baseline: 기준 전압 (mV)
 * 반환: V·s 단위의 누적선량
 */
export function calculateCumulativeDose(
  timestamps: number[],
  voltages: number[],
  baseline: number
): number {
  if (timestamps.length < 2) return 0;

  let integral = 0;

  // Trapezoidal integration
  for (let i = 1; i < timestamps.length; i++) {
    const dt = (timestamps[i] - timestamps[i - 1]) / 1000; // ms → s
    const v0 = Math.max(0, voltages[i - 1] - baseline);
    const v1 = Math.max(0, voltages[i] - baseline);
    integral += (v0 + v1) / 2 * dt;
  }

  return integral;
}
