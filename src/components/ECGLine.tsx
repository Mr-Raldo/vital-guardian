import { useMemo } from 'react';

interface ECGLineProps {
  heartRate?: number | null;
  isCritical?: boolean;
  width?: number;
  height?: number;
}

export function ECGLine({ heartRate, isCritical = false, width = 200, height = 40 }: ECGLineProps) {
  const pathData = useMemo(() => {
    const midY = height / 2;
    const segmentWidth = 60;
    // Generate one ECG beat pattern
    const beat = (startX: number) => {
      const p = startX;
      return `L${p + 10},${midY} L${p + 15},${midY - 3} L${p + 18},${midY + 2} L${p + 22},${midY} L${p + 28},${midY - height * 0.7} L${p + 32},${midY + height * 0.3} L${p + 35},${midY} L${p + 40},${midY - 4} L${p + 45},${midY} L${p + segmentWidth},${midY}`;
    };

    // Repeat the beat pattern enough times to fill 2x width (for seamless scroll)
    const totalWidth = width * 2;
    const beats = Math.ceil(totalWidth / segmentWidth) + 1;
    let d = `M0,${midY}`;
    for (let i = 0; i < beats; i++) {
      d += beat(i * segmentWidth);
    }
    return d;
  }, [width, height]);

  if (!heartRate) {
    return (
      <svg width={width} height={height} className="overflow-hidden">
        <line
          x1={0} y1={height / 2} x2={width} y2={height / 2}
          stroke="hsl(var(--muted-foreground))"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      </svg>
    );
  }

  return (
    <svg width={width} height={height} className="overflow-hidden">
      <g className="animate-ecg">
        <path
          d={pathData}
          className={`ecg-line ${isCritical ? 'ecg-line-critical' : ''}`}
        />
      </g>
    </svg>
  );
}
