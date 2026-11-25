import { useState } from 'react';
import { AlertCircle, CheckCircle2, FileUp } from 'lucide-react';
import { Dialog } from '../../components/ui/Dialog';
import type { DFADraft } from '../../engine';
import { parseImportedJson, type ImportPreviewResult } from '../../lib/importExport';

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirmImport: (draft: DFADraft) => void;
}

export function ImportDialog({ open, onClose, onConfirmImport }: ImportDialogProps) {
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleParse = (text: string) => {
    setRawText(text);
    if (!text.trim()) {
      setPreview(null);
      return;
    }
    setPreview(parseImportedJson(text));
  };

  const handleFile = async (file: File) => {
    if (file.size > 256 * 1024) {
      setPreview({
        ok: false,
        error: `Selected file is ${(file.size / 1024).toFixed(1)} KiB, which exceeds the 256 KiB limit.`,
      });
      return;
    }
    const text = await file.text();
    handleParse(text);
  };

  const handleClose = () => {
    setRawText('');
    setPreview(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} title="Import DFA from JSON" wide>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>
          Choose a <code>.json</code> file or paste schemaVersion 1 JSON below (max 256 KiB). Your current
          draft will not be overwritten until you confirm.
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          style={{
            border: `1.5px dashed ${dragOver ? 'var(--accent)' : 'var(--control-border)'}`,
            borderRadius: 'var(--radius-panel)',
            padding: '14px',
            background: dragOver ? 'var(--accent-subtle)' : 'var(--surface-subtle)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
            <FileUp size={16} aria-hidden="true" />
            Drag & drop a <code>.json</code> file here, or choose from disk:
          </span>
          <input
            type="file"
            accept=".json,application/json"
            aria-label="Choose JSON file to import"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </div>

        <div>
          <label htmlFor="import-json-textarea" className="field-label">
            Paste DFA JSON
          </label>
          <textarea
            id="import-json-textarea"
            className="textarea-input mono"
            style={{ fontSize: 12.5 }}
            placeholder='{"schemaVersion": 1, "name": "...", "states": [...], ...}'
            value={rawText}
            onChange={(e) => handleParse(e.target.value)}
          />
        </div>

        {preview && !preview.ok && (
          <div className="status-banner danger" role="alert">
            <AlertCircle size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>{preview.error}</div>
          </div>
        )}

        {preview && preview.ok && (
          <div
            className={`status-banner ${preview.isCompleteValid ? 'success' : 'warning'}`}
            role="status"
          >
            <CheckCircle2 size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <strong>
                Preview: {preview.draft.name} ({preview.stateCount} states, {preview.symbolCount} symbols,{' '}
                {preview.transitionCount} transitions)
              </strong>
              {preview.isCompleteValid ? (
                <span style={{ fontSize: 13 }}>Complete, valid DFA ready to solve.</span>
              ) : (
                <div style={{ fontSize: 13 }}>
                  Structurally valid draft with {preview.issues.length} issue(s) to fix in the builder:
                  <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                    {preview.issues.slice(0, 4).map((iss, idx) => (
                      <li key={idx}>{iss.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.warnings.length > 0 && (
                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                  Note: {preview.warnings[0]!.message}
                </span>
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" className="btn" onClick={handleClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!preview || !preview.ok}
            onClick={() => {
              if (preview && preview.ok) {
                onConfirmImport(preview.draft);
                handleClose();
              }
            }}
          >
            Load into builder
          </button>
        </div>
      </div>
    </Dialog>
  );
}
