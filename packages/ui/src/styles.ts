const STYLE_ID = 'cwe-ui-styles'

const CSS = `
.cwe-content[data-empty="true"][data-placeholder]::before {
  content: attr(data-placeholder);
  position: absolute;
  color: #9b9a97;
  pointer-events: none;
}
.cwe-content .cwe-list-item {
  position: relative;
  padding-left: 24px;
}
.cwe-content .cwe-list-item::before {
  position: absolute;
  left: 4px;
  pointer-events: none;
}
.cwe-content .cwe-list-item[data-list="bullet"]::before {
  content: "•";
}
.cwe-content .cwe-list-item[data-list="ordered"]::before {
  content: attr(data-ordinal) ".";
  font-variant-numeric: tabular-nums;
}
.cwe-content .cwe-children {
  margin-left: 24px;
}
.cwe-content .cwe-todo {
  position: relative;
  padding-left: 26px;
}
.cwe-content .cwe-todo > input.cwe-todo-box {
  position: absolute;
  left: 2px;
  top: 0.28em;
  margin: 0;
  cursor: pointer;
}
.cwe-content .cwe-todo[data-checked="true"] {
  color: #9b9a97;
  text-decoration: line-through;
}
.cwe-content blockquote[data-path] {
  border-left: 3px solid currentColor;
  margin: 4px 0;
  padding-left: 12px;
}
.cwe-content pre[data-path] {
  background: rgba(135, 131, 120, 0.15);
  border-radius: 6px;
  padding: 12px 14px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.875em;
  overflow-x: auto;
  margin: 4px 0;
}
.cwe-content .cwe-callout {
  position: relative;
  background: rgba(135, 131, 120, 0.12);
  border-radius: 6px;
  padding: 10px 14px 10px 40px;
  margin: 4px 0;
}
.cwe-content .cwe-callout::before {
  content: attr(data-emoji);
  position: absolute;
  left: 12px;
}
.cwe-content hr[data-path] {
  border: none;
  border-top: 1px solid rgba(55, 53, 47, 0.25);
  margin: 10px 0;
}
.cwe-content table.cwe-table {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
}
.cwe-content .cwe-table th,
.cwe-content .cwe-table td {
  border: 1px solid rgba(55, 53, 47, 0.25);
  padding: 6px 10px;
  text-align: left;
  min-width: 48px;
  vertical-align: top;
}
.cwe-content .cwe-table th {
  background: rgba(135, 131, 120, 0.09);
  font-weight: 600;
}
.cwe-gutter {
  position: fixed;
  z-index: 9998;
  display: flex;
  gap: 1px;
  align-items: center;
}
.cwe-table-menu {
  position: fixed;
  z-index: 9998;
  display: flex;
  gap: 1px;
  padding: 2px;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(15, 15, 15, 0.12);
}
.cwe-table-menu button {
  font: inherit;
  font-size: 11px;
  border: none;
  background: none;
  border-radius: 4px;
  padding: 3px 7px;
  cursor: pointer;
  color: #37352f;
}
.cwe-table-menu button:hover {
  background: rgba(55, 53, 47, 0.08);
}
@media (prefers-color-scheme: dark) {
  .cwe-table-menu {
    background: #252525;
    border-color: rgba(255, 255, 255, 0.13);
  }
  .cwe-table-menu button {
    color: #d4d4d4;
  }
  .cwe-table-menu button:hover {
    background: rgba(255, 255, 255, 0.08);
  }
}
.cwe-gutter-btn {
  font: inherit;
  font-size: 14px;
  line-height: 1;
  border: none;
  background: none;
  border-radius: 4px;
  padding: 3px 4px;
  cursor: pointer;
  color: rgba(55, 53, 47, 0.45);
}
.cwe-gutter-btn:hover {
  background: rgba(55, 53, 47, 0.08);
  color: rgba(55, 53, 47, 0.8);
}
.cwe-gutter-drag {
  cursor: grab;
}
.cwe-drop-indicator {
  position: fixed;
  z-index: 9998;
  height: 3px;
  border-radius: 2px;
  background: #4a9fe8;
  pointer-events: none;
}
@media (prefers-color-scheme: dark) {
  .cwe-gutter-btn {
    color: rgba(212, 212, 212, 0.45);
  }
  .cwe-gutter-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(212, 212, 212, 0.9);
  }
}
.cwe-bubble, .cwe-slash {
  position: fixed;
  z-index: 9999;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 15, 15, 0.15), 0 2px 4px rgba(15, 15, 15, 0.1);
  font-family: system-ui, sans-serif;
  font-size: 14px;
  color: #37352f;
}
.cwe-bubble {
  display: flex;
  flex-direction: column;
  padding: 3px;
}
.cwe-bubble-row {
  display: flex;
  align-items: center;
  gap: 1px;
}
.cwe-link-editor {
  display: flex;
  align-items: center;
  gap: 4px;
  border-top: 1px solid rgba(55, 53, 47, 0.15);
  margin-top: 4px;
  padding: 6px 4px 3px;
}
.cwe-bubble input.cwe-link-input {
  font: inherit;
  font-size: 13px;
  border: 1px solid rgba(55, 53, 47, 0.2);
  border-radius: 5px;
  padding: 4px 7px;
  min-width: 180px;
  color: inherit;
  background: #fff;
}
.cwe-bubble input.cwe-link-input:focus {
  outline: none;
  border-color: #2383e2;
}
.cwe-bubble button.cwe-link-apply,
.cwe-bubble button.cwe-link-remove {
  font-size: 12px;
  padding: 4px 8px;
  white-space: nowrap;
}
.cwe-bubble button.cwe-link-remove {
  color: #e03e3e;
}
.cwe-palette {
  display: grid;
  gap: 5px;
  border-top: 1px solid rgba(55, 53, 47, 0.15);
  margin-top: 4px;
  padding: 6px 4px 3px;
}
.cwe-palette-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.cwe-palette-label {
  font-size: 11px;
  color: #9b9a97;
  width: 32px;
  flex-shrink: 0;
}
.cwe-bubble button.cwe-swatch {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid rgba(55, 53, 47, 0.2);
  border-radius: 4px;
  font-size: 11px;
  line-height: 1;
}
.cwe-bubble input.cwe-swatch-custom {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px dashed rgba(55, 53, 47, 0.35);
  border-radius: 4px;
  background: none;
  cursor: pointer;
}
.cwe-bubble input.cwe-swatch-custom::-webkit-color-swatch-wrapper {
  padding: 2px;
}
.cwe-bubble input.cwe-swatch-custom::-webkit-color-swatch {
  border: none;
  border-radius: 2px;
}
.cwe-bubble button.cwe-size {
  font-size: 11px;
  padding: 3px 7px;
  border: 1px solid rgba(55, 53, 47, 0.2);
  border-radius: 4px;
}
.cwe-bubble button {
  font: inherit;
  border: none;
  background: none;
  border-radius: 5px;
  padding: 5px 8px;
  cursor: pointer;
  color: inherit;
  line-height: 1;
}
.cwe-bubble button:hover {
  background: rgba(55, 53, 47, 0.08);
}
.cwe-bubble button.cwe-active {
  color: #2383e2;
}
.cwe-bubble .cwe-sep {
  width: 1px;
  align-self: stretch;
  margin: 3px 3px;
  background: rgba(55, 53, 47, 0.15);
}
.cwe-slash {
  min-width: 220px;
  max-height: 300px;
  overflow-y: auto;
  padding: 5px;
}
.cwe-slash-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 5px;
  cursor: pointer;
}
.cwe-slash-item.cwe-active {
  background: rgba(55, 53, 47, 0.08);
}
.cwe-slash-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(55, 53, 47, 0.15);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  background: #fff;
  flex-shrink: 0;
}
.cwe-slash-label {
  flex: 1;
}
.cwe-slash-empty {
  padding: 6px 8px;
  color: #9b9a97;
}
@media (prefers-color-scheme: dark) {
  .cwe-bubble, .cwe-slash {
    background: #252525;
    color: #d4d4d4;
    border-color: rgba(255, 255, 255, 0.13);
  }
  .cwe-bubble button:hover, .cwe-slash-item.cwe-active {
    background: rgba(255, 255, 255, 0.08);
  }
  .cwe-bubble input.cwe-link-input {
    background: #2f2f2f;
    border-color: rgba(255, 255, 255, 0.13);
  }
  .cwe-slash-icon {
    background: #2f2f2f;
    border-color: rgba(255, 255, 255, 0.13);
  }
}
`

/** Injects the widget stylesheet once per document. Called by the widgets themselves. */
export function injectStyles(documentRef: Document): void {
  if (documentRef.getElementById(STYLE_ID)) return
  const style = documentRef.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  documentRef.head.appendChild(style)
}
