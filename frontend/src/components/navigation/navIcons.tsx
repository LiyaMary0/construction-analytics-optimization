import type { WorkspaceNavIcon } from "../../config/workspaceNav";

const iconProps = {
  "aria-hidden": true as const,
  fill: "none",
  height: 18,
  width: 18,
  viewBox: "0 0 18 18",
};

export const WorkspaceNavIconMark = ({ name }: { name: WorkspaceNavIcon }) => {
  if (name === "dashboard") {
    return (
      <svg {...iconProps}>
        <path d="M3 3h5v5H3V3Zm7 0h5v8h-5V3ZM3 10h5v5H3v-5Zm7 3h5v2h-5v-2Z" fill="currentColor" />
      </svg>
    );
  }

  if (name === "projects") {
    return (
      <svg {...iconProps}>
        <path
          d="M3 4.75A1.75 1.75 0 0 1 4.75 3h2.3c.46 0 .9.182 1.226.508l.716.717c.14.14.33.219.528.219h3.73A1.75 1.75 0 0 1 15 6.194v7.056A1.75 1.75 0 0 1 13.25 15H4.75A1.75 1.75 0 0 1 3 13.25V4.75Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
        <path d="M6 8.25h6M6 11.25h3.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      </svg>
    );
  }

  if (name === "finance") {
    return (
      <svg {...iconProps}>
        <path
          d="M3.5 14.5V7.5M7.5 14.5V4.5M11.5 14.5V9M14.5 14.5H3"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.5"
        />
      </svg>
    );
  }

  if (name === "users") {
    return (
      <svg {...iconProps}>
        <path
          d="M6 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm6 1.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM1.75 15.25A4.25 4.25 0 0 1 6 11h1a4.25 4.25 0 0 1 4.25 4.25M11 15.25a3.25 3.25 0 0 1 6.25 0"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </svg>
    );
  }

  if (name === "tasks") {
    return (
      <svg {...iconProps}>
        <path d="M6.5 4h5M7 2.75h4A1 1 0 0 1 12 3.75V5H6V3.75A1 1 0 0 1 7 2.75Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M5.5 5h7A1.5 1.5 0 0 1 14 6.5v8A1.5 1.5 0 0 1 12.5 16h-7A1.5 1.5 0 0 1 4 14.5v-8A1.5 1.5 0 0 1 5.5 5Z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 9.25h4M7 12h2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "attendance") {
    return (
      <svg {...iconProps}>
        <path d="M9 15.25a6.25 6.25 0 1 0 0-12.5 6.25 6.25 0 0 0 0 12.5Z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 6.25V9l2 1.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "documents") {
    return (
      <svg {...iconProps}>
        <path
          d="M5.25 3.75h5.2L12.75 6v8.25A1 1 0 0 1 11.75 15.5h-6.5a1 1 0 0 1-1-1.25V4.75a1 1 0 0 1 1-1Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M10.4 3.75V6h2.35M6.5 9h5M6.5 11.5h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "verify") {
    return (
      <svg {...iconProps}>
        <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6.4 9.1 8.2 10.8 11.7 7.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg {...iconProps}>
      <path
        d="M5 3.75h8A1.25 1.25 0 0 1 14.25 5v10L9 12.5 3.75 15V5A1.25 1.25 0 0 1 5 3.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const LogoutNavIcon = () => (
  <svg {...iconProps}>
    <path d="M6.75 3.75H5.5A1.75 1.75 0 0 0 3.75 5.5v7A1.75 1.75 0 0 0 5.5 14.25h1.25" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    <path d="M10.5 6.25 13.25 9l-2.75 2.75" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    <path d="M7 9h6.25" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
  </svg>
);
