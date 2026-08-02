import React from 'react';

export default function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 flex flex-col items-stretch gap-2.5 border-b border-slate-200/60 bg-white/90 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-8 sm:py-5">
      <div className="min-w-0">
        <h1 className="text-lg font-bold leading-tight text-slate-800 sm:truncate sm:text-xl">{title}</h1>
        {description ? <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500 sm:mt-0.5 sm:text-sm">{description}</p> : null}
      </div>
      {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-shrink-0">{actions}</div> : null}
    </header>
  );
}
