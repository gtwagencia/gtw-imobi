'use client';

interface HeaderProps {
  title:    string;
  actions?: React.ReactNode;
}

export default function Header({ title, actions }: HeaderProps) {
  return (
    <header className="h-12 bg-white border-b border-gray-100 flex items-center px-4 md:px-6 flex-shrink-0 gap-3">
      <div className="flex-1 min-w-0">
        <h1 className="font-bold text-sm md:text-base text-gray-900 truncate tracking-tight">{title}</h1>
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
      )}
    </header>
  );
}
