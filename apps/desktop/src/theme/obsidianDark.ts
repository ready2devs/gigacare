import { createDarkTheme, BrandVariants, Theme } from "@fluentui/react-components";

// Paleta Cyan Eléctrico (#00E5FF) y Violeta (#7C3AED)
const cyanBrand: BrandVariants = {
  10: "#001F24",
  20: "#003A43",
  30: "#005663",
  40: "#007384",
  50: "#0091A6",
  60: "#00B0CA",
  70: "#00D0EE",
  80: "#00E5FF", // Primario: Cyan Eléctrico
  90: "#33EAFF",
  100: "#66EFFF",
  110: "#99F4FF",
  120: "#CCFAFF",
  130: "#E5FCFF",
  140: "#F2FEFF",
  150: "#FAFFFF",
  160: "#FFFFFF",
};

export const obsidianDarkTheme: Theme = {
  ...createDarkTheme(cyanBrand),
  colorNeutralBackground1: "rgba(11, 15, 25, 0.75)", // #0B0F19 con transparencia para Mica
  colorNeutralBackground2: "rgba(18, 24, 38, 0.80)",
  colorNeutralBackground3: "rgba(26, 34, 52, 0.85)",
  colorBrandBackground: "#00E5FF",
  colorBrandBackgroundHover: "#33EAFF",
  colorBrandBackgroundPressed: "#00B0CA",
  colorBrandForeground1: "#00E5FF",
  colorBrandForeground2: "#7C3AED", // Secundario: Violeta
  colorNeutralForeground1: "#F8FAFC",
  colorNeutralForeground2: "#94A3B8",
};
