import { useMemo } from "react";
import { palette } from "../engine/levels";
import { projectImage } from "../renderers/projectImage";

export function LevelThumbnail({
  colors,
  mode,
  radius,
}: {
  colors: number[];
  mode: "2d" | "3d";
  radius: number;
}) {
  const url = useMemo(() => {
    try {
      if (mode === "3d") return projectImage(colors, mode, true).toDataURL();
      const side = radius * 2 + 1,
        canvas = document.createElement("canvas");
      canvas.width = canvas.height = side * 6;
      const ctx = canvas.getContext("2d")!;
      colors.forEach((color, i) => {
        if (!color) return;
        ctx.fillStyle = palette[color];
        ctx.fillRect((i % side) * 6, Math.floor(i / side) * 6, 6, 6);
      });
      return canvas.toDataURL();
    } catch {
      return "";
    }
  }, [colors, mode, radius]);
  return url ? (
    <img className="level-thumbnail" src={url} alt="" />
  ) : (
    <span className="level-thumbnail" aria-hidden="true" />
  );
}
