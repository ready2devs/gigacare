import { createLightTheme, BrandVariants, Theme } from "@fluentui/react-components";

const cyanBrand: BrandVariants = {
  10: "#001F24",
  20: "#003A43",
  30: "#005663",
  40: "#007384",
  50: "#0091A6",
  60: "#00B0CA",
  70: "#00D0EE",
  80: "#00A3B5", // Ajustado para contraste en fondo claro
  90: "#00B0CA",
  100: "#00D0EE",
  110: "#00E5FF",
  120: "#CCFAFF",
  130: "#E5FCFF",
  140: "#F2FEFF",
  150: "#FAFFFF",
  160: "#FFFFFF",
};

export const gigacareLightTheme: Theme = {
  ...createLightTheme(cyanBrand),
  colorNeutralBackground1: "rgba(248, 250, 252, 0.85)",
  colorNeutralBackground2: "rgba(241, 245, 249, 0.90)",
  colorNeutralBackground3: "rgba(226, 232, 240, 0.95)",
  colorBrandForeground1: "#007384",
  colorBrandForeground2: "#7C3AED",
  colorNeutralForeground1: "#0F172A",
  colorNeutralForeground2: "#475569",
};
