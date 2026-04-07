const BADGE_CONFIG = {
  sbc: {
    label: "SBC",
    className: "bg-red-900/50 text-red-300 border border-red-700/50",
  },
  founders: {
    label: "Founders",
    className: "bg-amber-900/50 text-amber-300 border border-amber-700/50",
  },
  nineMarks: {
    label: "9Marks",
    className: "bg-purple-900/50 text-purple-300 border border-purple-700/50",
  },
} as const;

export function SourceBadge({ source }: { source: keyof typeof BADGE_CONFIG }) {
  const { label, className } = BADGE_CONFIG[source];
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
