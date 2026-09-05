import { useTheme } from "./ThemeContext";

/**
 * Recharts takes plain color strings as props, not CSS classes, so it can't
 * pick up --polar-* CSS variables on its own. This hook returns the current
 * theme's actual resolved values so every chart (grid lines, axis text,
 * tooltip background/border) responds to the theme toggle instead of being
 * stuck with hardcoded dark-mode hex values.
 */
export function useChartColors() {
  const { theme } = useTheme();
  return theme === "light"
    ? {
        grid: "#cbd5e1",
        axis: "#64748b",
        tooltipBg: "#ffffff",
        tooltipBorder: "#cbd5e1",
        panelFill: "#f8fafc",
        text: "#0f172a",
      }
    : {
        grid: "#1c2a41",
        axis: "#7d8ba1",
        tooltipBg: "#0b1220",
        tooltipBorder: "#1c2a41",
        panelFill: "#0f1a2c",
        text: "#e2e8f0",
      };
}
