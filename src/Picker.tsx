import { useState } from 'react';

export interface PickerOption {
  value: number | string;
  label: string;
  hint?: string;
}

interface Props {
  value: number | string;
  options: PickerOption[];
  onChange: (value: number | string) => void;
  title: string;
  placeholder?: string;
  big?: boolean; // larger type, used for the exercise choice during a workout
}

// Own dropdown instead of <select>: Safari renders the native popup in its own
// serif font and ignores CSS – and big buttons are easier to hit with sweaty hands.
export function Picker({ value, options, onChange, title, placeholder, big }: Props) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <>
      <button className={`picker${big ? ' big' : ''}`} onClick={() => setOpen(true)}>
        <span className="grow">{current?.label ?? placeholder ?? 'Auswählen …'}</span>
        <span className="picker-arrow">▾</span>
      </button>

      {open && (
        <div className="picker-sheet" onClick={() => setOpen(false)}>
          <div className="picker-panel" onClick={(e) => e.stopPropagation()}>
            <p className="label">{title}</p>
            <div className="list">
              {options.map((o) => (
                <button
                  key={o.value}
                  className={`list-item${o.value === value ? ' on' : ''}`}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <span className="grow">
                    {o.label}
                    {o.hint && (
                      <>
                        <br />
                        <span className="small muted">{o.hint}</span>
                      </>
                    )}
                  </span>
                  {o.value === value && <span className="accent">✓</span>}
                </button>
              ))}
            </div>
            <button className="btn secondary block section-sm" onClick={() => setOpen(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </>
  );
}
