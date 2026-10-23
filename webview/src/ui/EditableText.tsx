import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { keepNativeUndo } from './textKeys';

interface Props {
  value: string;
  editing: boolean;
  multiline?: boolean;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
  /** Called once when edit mode ends and the text changed. */
  onCommit(value: string): void;
  /** Esc or Tab/Enter in a title: ask the owner to leave or move edit mode. */
  onExit(reason: 'escape' | 'next'): void;
  onDoubleClick?(): void;
}

/**
 * Plain text that turns into a textarea (or input) in edit mode.
 * The edit is committed when edit mode ends, however it ends: Esc, click outside, selection change.
 */
export function EditableText({ value, editing, multiline = true, className = '', style, placeholder, onCommit, onExit, onDoubleClick }: Props) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(draft);
  const valueRef = useRef(value);
  const commitRef = useRef(onCommit);
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  draftRef.current = draft;
  valueRef.current = value;
  commitRef.current = onCommit;

  useLayoutEffect(() => {
    if (!editing) return;
    setDraft(valueRef.current);
    draftRef.current = valueRef.current;
    const el = ref.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
    return () => {
      if (draftRef.current !== valueRef.current) commitRef.current(draftRef.current);
    };
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  if (!editing) {
    return (
      <div className={`eb-text ${className}`} style={style} onDoubleClick={onDoubleClick}>
        {value === '' && placeholder ? <span className="eb-placeholder">{placeholder}</span> : value}
      </div>
    );
  }

  const onKeyDown = (e: KeyboardEvent) => {
    keepNativeUndo(e);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onExit('escape');
    } else if (e.key === 'Tab' || (!multiline && e.key === 'Enter')) {
      e.preventDefault();
      onExit('next');
    }
  };

  const common = {
    ref,
    className: `eb-text eb-text-edit nodrag nowheel nopan ${className}`,
    style,
    value: draft,
    spellCheck: false,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onKeyDown,
  };
  return multiline ? <textarea {...common} /> : <input type="text" {...common} />;
}
