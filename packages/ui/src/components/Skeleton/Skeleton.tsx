import { cx } from "../../cx.js";
import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
}

/** Placeholder de carga con shimmer (respeta prefers-reduced-motion). */
export function Skeleton({ width = "100%", height = 14, radius = 8, className }: SkeletonProps) {
  return (
    <span
      className={cx(styles.skeleton, className)}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}
