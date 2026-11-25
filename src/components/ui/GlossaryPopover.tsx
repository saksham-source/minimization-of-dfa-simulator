import { useEffect, useId, useRef, useState } from 'react';
import { BookOpen, X } from 'lucide-react';
import { GLOSSARY } from './glossaryData';

export function GlossaryTerm({
  id,
  label,
}: {
  id: keyof typeof GLOSSARY;
  label?: string;
}) {
  const entry = GLOSSARY[id];
  const [open, setOpen] = useState(false);
  const popId = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [open]);

  if (!entry) return <span>{label ?? id}</span>;

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        style={{
          background: 'transparent',
          border: 'none',
          borderBottom: '1.5px dotted var(--accent)',
          color: 'var(--accent)',
          padding: 0,
          fontWeight: 550,
          cursor: 'pointer',
        }}
      >
        {label ?? entry.term}
      </button>
      {open && (
        <div
          id={popId}
          role="dialog"
          aria-label={`Glossary: ${entry.term}`}
          style={{
            position: 'absolute',
            left: 0,
            top: 'calc(100% + 6px)',
            zIndex: 60,
            width: 'min(300px, 82vw)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-panel)',
            boxShadow: 'var(--shadow-popover)',
            padding: '12px',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 650, fontSize: 13 }}>
              <BookOpen size={14} aria-hidden="true" />
              {entry.term}
              {entry.symbol && <code style={{ fontSize: 12, color: 'var(--muted)' }}>{entry.symbol}</code>}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              style={{ minHeight: 26, minWidth: 26 }}
              onClick={() => setOpen(false)}
              aria-label="Close glossary definition"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 550 }}>{entry.short}</p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>{entry.detail}</p>
        </div>
      )}
    </span>
  );
}
