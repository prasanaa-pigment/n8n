# AI Autocomplete Plugin (CodeMirror)

This folder contains the inline AI autocomplete plugin used by the n8n code editor.

## Source and attribution

- Initial implementation copied from `asadm/codemirror-copilot` (MIT):
  - https://github.com/asadm/codemirror-copilot/tree/main
- Original license is preserved in `LICENSE`.

## What is kept here

- Runtime source files only (no standalone package build setup).
- n8n-specific integration lives in `CodeNodeEditor.vue`, which provides the AI request callback and feature gating.
