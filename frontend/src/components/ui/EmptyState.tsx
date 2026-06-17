'use client';

import clsx from 'clsx';

// ── Inline SVG illustrations ────────────────────────────────────────────────

function IllustrationProperties() {
  return (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="20" y="45" width="50" height="40" rx="3" fill="#e0e7ff" stroke="#6366f1" strokeWidth="1.5"/>
      <polygon points="45,20 70,45 20,45" fill="#c7d2fe" stroke="#6366f1" strokeWidth="1.5"/>
      <rect x="38" y="62" width="14" height="23" rx="2" fill="#6366f1" opacity=".4"/>
      <rect x="27" y="54" width="10" height="10" rx="1" fill="#6366f1" opacity=".3"/>
      <rect x="53" y="54" width="10" height="10" rx="1" fill="#6366f1" opacity=".3"/>
      <circle cx="88" cy="42" r="18" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1.5"/>
      <circle cx="88" cy="42" r="10" stroke="#f59e0b" strokeWidth="1.5" fill="none"/>
      <line x1="101" y1="55" x2="108" y2="62" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

function IllustrationContacts() {
  return (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="40" cy="38" r="16" fill="#e0e7ff" stroke="#6366f1" strokeWidth="1.5"/>
      <circle cx="40" cy="32" r="8" fill="#c7d2fe" stroke="#6366f1" strokeWidth="1.2"/>
      <path d="M16 72c0-13 12-20 24-20s24 7 24 20" stroke="#6366f1" strokeWidth="1.5" fill="#e0e7ff"/>
      <circle cx="82" cy="40" r="18" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1.5" opacity=".6"/>
      <line x1="82" y1="32" x2="82" y2="48" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
      <line x1="74" y1="40" x2="90" y2="40" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function IllustrationConversations() {
  return (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="10" y="18" width="65" height="42" rx="8" fill="#e0e7ff" stroke="#6366f1" strokeWidth="1.5"/>
      <path d="M20 60 L10 72 L35 66" fill="#e0e7ff" stroke="#6366f1" strokeWidth="1.5" strokeLinejoin="round"/>
      <line x1="22" y1="34" x2="53" y2="34" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" opacity=".5"/>
      <line x1="22" y1="44" x2="45" y2="44" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" opacity=".3"/>
      <circle cx="90" cy="55" r="20" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1.5"/>
      <path d="M90 45 A10 10 0 0 1 90 65" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" fill="none"/>
      <line x1="90" y1="49" x2="90" y2="57" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="90" cy="61" r="1.5" fill="#f59e0b"/>
    </svg>
  );
}

function IllustrationKanban() {
  return (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="8"  y="20" width="28" height="60" rx="4" fill="#e0e7ff" stroke="#6366f1" strokeWidth="1.5"/>
      <rect x="46" y="30" width="28" height="50" rx="4" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1.5"/>
      <rect x="84" y="40" width="28" height="40" rx="4" fill="#dcfce7" stroke="#22c55e" strokeWidth="1.5"/>
      <rect x="13" y="26" width="18" height="8"  rx="2" fill="#6366f1" opacity=".4"/>
      <rect x="13" y="38" width="18" height="8"  rx="2" fill="#6366f1" opacity=".3"/>
      <rect x="51" y="36" width="18" height="8"  rx="2" fill="#f59e0b" opacity=".5"/>
      <rect x="51" y="48" width="18" height="8"  rx="2" fill="#f59e0b" opacity=".3"/>
      <rect x="89" y="46" width="18" height="8"  rx="2" fill="#22c55e" opacity=".5"/>
    </svg>
  );
}

function IllustrationGeneric() {
  return (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="60" cy="45" r="30" fill="#e0e7ff" stroke="#6366f1" strokeWidth="1.5"/>
      <path d="M48 45 L56 53 L72 37" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".4"/>
    </svg>
  );
}

const ILLUSTRATIONS = {
  properties:    IllustrationProperties,
  contacts:      IllustrationContacts,
  conversations: IllustrationConversations,
  kanban:        IllustrationKanban,
  generic:       IllustrationGeneric,
} as const;

// ── Component ───────────────────────────────────────────────────────────────

interface EmptyStateProps {
  illustration?: keyof typeof ILLUSTRATIONS;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

export default function EmptyState({
  illustration = 'generic',
  title,
  description,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  const Illustration = ILLUSTRATIONS[illustration];

  return (
    <div className={clsx(
      'flex flex-col items-center justify-center text-center',
      compact ? 'py-10 px-6' : 'py-16 px-8',
      className,
    )}>
      <div className={clsx('mb-4', compact ? 'w-20 h-16' : 'w-28 h-24')}>
        <Illustration />
      </div>
      <h3 className={clsx('font-bold text-gray-700', compact ? 'text-sm' : 'text-base mb-1')}>
        {title}
      </h3>
      {description && (
        <p className={clsx('text-gray-400 max-w-xs', compact ? 'text-xs mt-0.5' : 'text-sm mt-1')}>
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
