import { FIGURES, type FigureVariant } from "./figur-data";
import { cn } from "@/lib/utils";

// Figurens siluett framifrån, ur samma mesh som 3D-figuren. Visas medan
// 3D:n laddar (så att något står på skärmen direkt) och är grunden för
// 2D-kartan om 3D-figuren inte klarar kraven.

type Props = React.ComponentProps<"svg"> & { variant: FigureVariant };

export function Silhouette({ variant, className, ...props }: Props) {
  const { silhouettePath, silhouetteBox } = FIGURES[variant];
  const [x0, y0, x1, y1] = silhouetteBox;
  return (
    <svg
      viewBox={`${x0} ${-y1} ${x1 - x0} ${y1 - y0}`}
      className={cn("fill-border", className)}
      aria-hidden="true"
      {...props}
    >
      <g transform="scale(1,-1)">
        <path d={silhouettePath} fillRule="evenodd" />
      </g>
    </svg>
  );
}
