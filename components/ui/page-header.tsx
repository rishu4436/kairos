import type { ReactNode } from "react";

export function PageHeader({
  kicker,
  title,
  description,
  meta,
}: {
  kicker: string;
  title: string;
  description?: string;
  meta?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        <p className="eyebrow">{kicker}</p>
        <h1 className="page-title">{title}</h1>
        {description ? <p className="mt-2 text-sm text-muted">{description}</p> : null}
      </div>
      {meta ? <div className="flex flex-wrap gap-2">{meta}</div> : null}
    </header>
  );
}
