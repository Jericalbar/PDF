# FlowChart Studio — fixed paper clipping + multi-select

This version keeps the original FlowChart Studio editor and adds:

- **Fixed paper boundary for Print/PDF/PNG/SVG/Word**: anything outside the paper is clipped and never exported/printed.
- **Ctrl-click or Shift-click** to select multiple shapes.
- Ctrl/Shift-click an already selected shape to remove it from the selection.
- Drag a selected shape normally to move the whole selection together.
- **Ctrl+P** or File → Print prints only the paper area.

## Paper size
The current paper rectangle is `1200 × 560` canvas units, defined by `PAPER` in `script.js`.
If the physical paper in your setup uses another exact size, change only `PAPER.w` and `PAPER.h` (and `x/y` if needed). The editor itself remains unrestricted.
