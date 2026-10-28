import type { ReactNode } from "react";

interface Props {
  title: string;
  path?: string;
  right?: ReactNode;
  className?: string;
  bodyClassName?: string;
  accent?: "ph" | "cy" | "amber";
  children: ReactNode;
}

const accentText = { ph: "text-ph", cy: "text-cy", amber: "text-amber" } as const;
const accentBorder = { ph: "border-ph/30", cy: "border-cy/40", amber: "border-amber/40" } as const;
const accentCorner = { ph: "border-ph", cy: "border-cy", amber: "border-amber" } as const;

/** Janela de terminal: barra de título estilo shell e cantos em colchete. */
export function TerminalPanel({ title, path, right, className = "", bodyClassName = "", accent = "ph", children }: Props) {
  const corner = `pointer-events-none absolute h-3 w-3 ${accentCorner[accent]}`;
  return (
    <section
      className={`sweep relative flex min-w-0 flex-col overflow-hidden border ${accentBorder[accent]} bg-panel/80 backdrop-blur-[1px] box-glow ${className}`}
    >
      <span className={`${corner} left-0 top-0 border-l-2 border-t-2`} />
      <span className={`${corner} right-0 top-0 border-r-2 border-t-2`} />
      <span className={`${corner} bottom-0 left-0 border-b-2 border-l-2`} />
      <span className={`${corner} bottom-0 right-0 border-b-2 border-r-2`} />

      <header className="flex items-center justify-between gap-3 border-b border-ph/15 bg-ph/[0.03] px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-ph-dim">
        <span className="min-w-0 truncate">
          ┌─[ <span className={`glow ${accentText[accent]}`}>{title}</span> ]{path && <>─[ {path} ]</>}
        </span>
        <span className="shrink-0">{right ?? "■ ■ ■"}</span>
      </header>
      <div className={`relative flex flex-1 flex-col p-4 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
