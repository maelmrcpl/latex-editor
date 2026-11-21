import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
} from '@codemirror/language';
import { type Diagnostic, lintGutter, setDiagnostics } from '@codemirror/lint';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import type { DiagnosticItem, ProjectFileEntry } from '@prism-latex/shared';
import { createLatexExtensions } from '../lib/latexLanguage';

export interface CodeMirrorHandle {
  jumpToLine: (line: number) => void;
  insertAtCursor: (text: string) => void;
  getCursorLine: () => number;
}

interface CodeMirrorPaneProps {
  filePath: string;
  value: string;
  allFiles: ProjectFileEntry[];
  diagnostics: DiagnosticItem[];
  onChange: (nextValue: string) => void;
  onSaveShortcut: () => void;
  onCompileShortcut: () => void;
  onForwardSyncShortcut: (line: number) => void;
  /** Position du curseur (ligne, colonne), base 1 */
  onCursorChange?: (line: number, col: number) => void;
}

export const CodeMirrorPane = forwardRef<CodeMirrorHandle, CodeMirrorPaneProps>(
  (
    {
      filePath,
      value,
      allFiles,
      diagnostics,
      onChange,
      onSaveShortcut,
      onCompileShortcut,
      onForwardSyncShortcut,
      onCursorChange,
    },
    ref
  ) => {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const filesRef = useRef<ProjectFileEntry[]>(allFiles);
    const callbacksRef = useRef({
      onChange,
      onSaveShortcut,
      onCompileShortcut,
      onForwardSyncShortcut,
      onCursorChange,
    });

    filesRef.current = allFiles;
    callbacksRef.current = {
      onChange,
      onSaveShortcut,
      onCompileShortcut,
      onForwardSyncShortcut,
      onCursorChange,
    };

    useImperativeHandle(ref, () => ({
      jumpToLine(lineNum: number) {
        const view = viewRef.current;
        if (!view) return;
        const clamped = Math.max(1, Math.min(lineNum, view.state.doc.lines));
        const line = view.state.doc.line(clamped);
        view.dispatch({
          selection: { anchor: line.from, head: line.to },
          effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
        });
        view.focus();
      },
      insertAtCursor(text: string) {
        const view = viewRef.current;
        if (!view) return;
        const sel = view.state.selection.main;
        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: text },
          selection: { anchor: sel.from + text.length },
        });
        view.focus();
      },
      getCursorLine(): number {
        const view = viewRef.current;
        if (!view) return 1;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
      },
    }));

    // Recreate editor state cleanly when active filePath switches
    useEffect(() => {
      if (!hostRef.current) return;

      const state = EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          foldGutter(),
          lintGutter(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          EditorView.lineWrapping,
          keymap.of([
            {
              key: 'Mod-s',
              run: () => {
                callbacksRef.current.onSaveShortcut();
                return true;
              },
            },
            {
              key: 'Mod-Enter',
              run: () => {
                callbacksRef.current.onCompileShortcut();
                return true;
              },
            },
            {
              key: 'Mod-Shift-j',
              run: (view) => {
                const ln = view.state.doc.lineAt(view.state.selection.main.head).number;
                callbacksRef.current.onForwardSyncShortcut(ln);
                return true;
              },
            },
            indentWithTab,
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
          ]),
          ...createLatexExtensions(() => filesRef.current),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              callbacksRef.current.onChange(update.state.doc.toString());
            }
            if (update.docChanged || update.selectionSet || update.startState.doc.length === 0) {
              const head = update.state.selection.main.head;
              const line = update.state.doc.lineAt(head);
              callbacksRef.current.onCursorChange?.(line.number, head - line.from + 1);
            }
          }),
        ],
      });

      const view = new EditorView({
        state,
        parent: hostRef.current,
      });

      viewRef.current = view;

      return () => {
        view.destroy();
        viewRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filePath]);

    // Sync external value updates (e.g. when Citations appends to references.bib while open)
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const current = view.state.doc.toString();
      if (current !== value) {
        view.dispatch({
          changes: { from: 0, to: current.length, insert: value },
        });
      }
    }, [value]);

    // Push LaTeX diagnostics for the current file into CodeMirror lint markers
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;

      const cmDiags: Diagnostic[] = [];
      for (const d of diagnostics) {
        if (d.file !== filePath || !d.line) continue;
        const clamped = Math.max(1, Math.min(d.line, view.state.doc.lines));
        const lineObj = view.state.doc.line(clamped);
        cmDiags.push({
          from: lineObj.from,
          to: lineObj.to,
          severity: d.severity === 'error' ? 'error' : 'warning',
          message: d.message,
        });
      }

      view.dispatch(setDiagnostics(view.state, cmDiags));
    }, [diagnostics, filePath]);

    return <div ref={hostRef} className="w-full flex-1 min-h-0 overflow-hidden bg-surface-container-lowest" />;
  }
);

CodeMirrorPane.displayName = 'CodeMirrorPane';
