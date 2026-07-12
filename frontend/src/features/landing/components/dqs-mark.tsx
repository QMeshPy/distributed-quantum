interface DqsMarkProps {
  className?: string;
}

export function DqsMark({ className }: DqsMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8.5 13.5 22 5.75l13.5 7.75v15L22 36.25 8.5 28.5v-15Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="m8.5 13.5 13.5 8 13.5-8M22 21.5v14.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="22" cy="5.75" r="2.75" fill="currentColor" />
      <circle cx="8.5" cy="13.5" r="2.75" fill="currentColor" />
      <circle cx="35.5" cy="13.5" r="2.75" fill="currentColor" />
      <circle cx="22" cy="21.5" r="3.5" fill="currentColor" />
      <circle cx="8.5" cy="28.5" r="2.75" fill="currentColor" />
      <circle cx="35.5" cy="28.5" r="2.75" fill="currentColor" />
      <circle cx="22" cy="36.25" r="2.75" fill="currentColor" />
    </svg>
  );
}
