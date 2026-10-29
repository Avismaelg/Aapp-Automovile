import { useMemo } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '@/src/theme';

export function Trend({
  values,
  color = colors.lime,
  width = 190,
  height = 52,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  const { points, lastX, lastY } = useMemo(() => {
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    const built = values.map((value, index) => {
      const x = 8 + (index / (values.length - 1)) * 174;
      const y = 44 - ((value - min) / range) * 30;
      return { x, y };
    });
    return {
      points: built.map((point) => `${point.x},${point.y}`).join(' '),
      lastX: built[built.length - 1].x,
      lastY: built[built.length - 1].y,
    };
  }, [values]);

  return (
    <Svg width={width} height={height} viewBox="0 0 190 52">
      <Path
        d={`M ${points.split(' ').join(' L ')}`}
        stroke={color}
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={lastX} cy={lastY} r={4} fill={color} />
    </Svg>
  );
}
