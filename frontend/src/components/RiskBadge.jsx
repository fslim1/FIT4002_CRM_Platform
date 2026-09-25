import React from 'react';

const RISK_CONFIG = {
  Low: {
    label: 'Low Risk',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
    icon: '🟢',
  },
  Medium: {
    label: 'Medium Risk',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
    icon: '🟡',
  },
  High: {
    label: 'High Risk',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    dot: 'bg-rose-500',
    icon: '🔴',
  },
};

export default function RiskBadge({ level = 'Low', reason = '' }) {
  const config = RISK_CONFIG[level] || RISK_CONFIG.Low;

  return (
    <div className="group relative inline-flex items-center">
      {/* Visual Badge */}
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-all shadow-sm ${config.bg} ${config.text} ${config.border}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
        {config.label}
      </span>

      {/* Tooltip for Plain-English Explanation */}
      {reason && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden w-56 -translate-x-1/2 flex-col rounded-lg bg-stone-900 p-2 text-center text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:pointer-events-auto group-hover:flex group-hover:opacity-100">
          <div className="font-semibold text-stone-200">{config.label} Factor</div>
          <p className="mt-0.5 text-stone-300 leading-relaxed">{reason}</p>
          {/* Tooltip Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-stone-900" />
        </div>
      )}
    </div>
  );
}