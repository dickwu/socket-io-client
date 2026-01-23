'use client';

import Editor, { loader } from '@monaco-editor/react';

// Configure Monaco to load from CDN
loader.config({
  paths: {
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs',
  },
});

interface JsonEditorViewProps {
  content: string;
  isValidJson: boolean;
  wordWrap: 'on' | 'off';
  theme: 'vs-dark' | 'light';
  onChange: (value: string) => void;
}

export default function JsonEditorView({
  content,
  isValidJson,
  wordWrap,
  theme,
  onChange,
}: JsonEditorViewProps) {
  return (
    <Editor
      height="100%"
      language={isValidJson ? 'json' : 'plaintext'}
      value={content}
      onChange={(value) => onChange(value || '')}
      theme={theme}
      options={{
        readOnly: false,
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        wordWrap: wordWrap,
        automaticLayout: true,
        folding: true,
        foldingStrategy: 'indentation',
        formatOnPaste: true,
        tabSize: 2,
        padding: { top: 12, bottom: 12 },
        renderLineHighlight: 'line',
        scrollbar: {
          verticalScrollbarSize: 8,
          horizontalScrollbarSize: 8,
        },
      }}
    />
  );
}
