import type { SVGProps } from "react";

export type IconProps = { size?: number } & Omit<
  SVGProps<SVGSVGElement>,
  "width" | "height" | "viewBox"
>;

function attrs({ size = 18, ...rest }: IconProps): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ...rest,
  } as SVGProps<SVGSVGElement>;
}

export const IconFilm = (p: IconProps) => (
  <svg {...attrs(p)}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4" />
  </svg>
);

export const IconImage = (p: IconProps) => (
  <svg {...attrs(p)}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </svg>
);

export const IconCamera = (p: IconProps) => (
  <svg {...attrs(p)}>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

export const IconScan = (p: IconProps) => (
  <svg {...attrs(p)}>
    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
    <path d="M7 12h10" />
  </svg>
);

export const IconMic = (p: IconProps) => (
  <svg {...attrs(p)}>
    <rect x="9" y="2" width="6" height="11" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0M12 17v3" />
  </svg>
);

export const IconMusic = (p: IconProps) => (
  <svg {...attrs(p)}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

export const IconScript = (p: IconProps) => (
  <svg {...attrs(p)}>
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="M9 12h6M9 16h6" />
  </svg>
);

export const IconScissors = (p: IconProps) => (
  <svg {...attrs(p)}>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12" />
  </svg>
);

export const IconLayers = (p: IconProps) => (
  <svg {...attrs(p)}>
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
);

export const IconSparkles = (p: IconProps) => (
  <svg {...attrs(p)}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
    <path d="M19 15l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7.7-1.9z" />
    <path d="M5 16l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5.5-1.4z" />
  </svg>
);

export const IconCheck = (p: IconProps) => (
  <svg {...attrs(p)}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

export const IconX = (p: IconProps) => (
  <svg {...attrs(p)}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

export const IconChevron = (p: IconProps) => (
  <svg {...attrs(p)}>
    <path d="M9 18l6-6-6-6" />
  </svg>
);

export const IconClock = (p: IconProps) => (
  <svg {...attrs(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const IconDollar = (p: IconProps) => (
  <svg {...attrs(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M16 8.5C16 7.1 14.2 6 12 6s-4 1.1-4 2.5 1.8 2.2 4 2.7 4 1 4 2.6-2 2.2-4 2.2-4-.9-4-2.4" />
    <path d="M12 4v16" />
  </svg>
);

export const IconDownload = (p: IconProps) => (
  <svg {...attrs(p)}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5M12 15V3" />
  </svg>
);

export const IconLink = (p: IconProps) => (
  <svg {...attrs(p)}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

export const IconAlert = (p: IconProps) => (
  <svg {...attrs(p)}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);

export const IconPlus = (p: IconProps) => (
  <svg {...attrs(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
