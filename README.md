# KONEKTON

Visual Studio Code Extension that helps visualize your notes.

Open any `.canvas` file and get a Miro-like board: place sticky notes, rectangles, file references and links, move them around and connect them with lines to build simple flow charts.

## Features

On a virtual board (with grid toggle) you can place multiple objects:

- **Sticky notes** – coloured, square notes, just like in Miro.
- **Rectangles** – an optional bold title plus body text.
- **File references** – files from the folder of the `.canvas` file and its sub-folders. `.md`, `.txt` and `.json` files are shown as raw text and can be edited right on the board; changes are saved to the file. Other files show only their path.
- **Links** – an `http`/`https` URL; double-click opens it in your browser.

Every object shows four balls in the middle of its edges. Drag from a ball to another object to draw a curved connection line, or release on empty space to create a new object and connect it in one step. Lines have optional arrowheads and labels, and their end points can be moved along the border of an object or to another object.

Also included: infinite board with pan and zoom, grid with snapping, multi-select and box select, copy / paste / duplicate / delete, a right-click menu, and undo / redo through the normal VS Code commands (every board action is one undo step).

### Using the board

| Action | How |
|---|---|
| Add an object | Pick a tool in the left toolbar, then click the board. |
| Move / select | Drag an object. Drag on empty board for a selection box. Shift+click adds to the selection. |
| Pan | Space + drag, middle mouse drag, or two-finger scroll on a trackpad. |
| Zoom | Mouse wheel, trackpad pinch, or the controls at the bottom right (click the percentage to reset to 100 %). |
| Edit text | Double-click an object. Esc or a click outside finishes. In a rectangle, Tab switches between title and body. |
| Connect | Drag from a ball. Release on an object, or on empty space to create a new one. |
| Move a line end | Select the line and drag the dot at its end. Dropping on empty space cancels. |
| Label a line | Double-click the line, or select it and use the toolbar. |
| Copy / paste / duplicate | Ctrl/Cmd+C, Ctrl/Cmd+V, Ctrl/Cmd+D, or the right-click menu. |
| Delete | Delete or Backspace, the toolbar, or the right-click menu. |
| Undo / redo | Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (inside a text field they act on the text). |

### Hold Shift to drop files

You can drag files from the VS Code Explorer onto the board. VS Code only delivers drops to an editor webview while you **hold Shift**, so hold Shift when you release the file. One file reference is created per file. Files outside the folder of the `.canvas` file are allowed and stored with `../` paths.

### Creating a board

There is no "New Board" command in this version. Create an empty file with the `.canvas` extension (for example `ideas.canvas`) and open it. An empty file is a valid empty board. To see the raw JSON, use **Reopen Editor With… → Text Editor**.

## Settings

| Setting | Default | Description |
|---|---|---|
| `konekton.grid.enabled` | `false` | Show the board grid and snap objects to it. Also switched by the grid button on the board. User-level setting. |

## File format

Boards are [JSON Canvas 1.0](https://jsoncanvas.org/spec/1.0/) files. Konekton keeps its own data (kind of note, font size, line end offsets, …) in one `konekton` field on nodes and edges. Things it does not understand (for example `group` nodes) are kept in the file untouched. Compatibility with other canvas editors is not a goal of this version.

## Limitations of version 1

- No groups / frames (`group` nodes are kept in the file but not shown), no Markdown rendering, no image or PDF previews.
- Only the standalone desktop app is supported. VS Code for the Web, Remote, WSL and Codespaces are not.
- Single workspace folder only.

## License

Konekton is licensed under the [PolyForm Shield License 1.0.0](https://polyformproject.org/licenses/shield/1.0.0) (the full text is in the `LICENSE` file): you may use, copy and change it, but you may not use it to provide a product that competes with it. Licenses of bundled packages are listed in `THIRD_PARTY_NOTICES.md`.

## Development

```sh
npm install
npm run build          # extension host (esbuild) + webview (Vite) into dist/
npm run watch          # rebuild on change
npm run typecheck
npm run lint
npm run test:unit      # Vitest
npm run test:integration   # downloads VS Code, runs the extension tests
npm run package        # builds konekton-<version>.vsix
```

Press F5 ("Run Extension") to start an Extension Development Host with the sample boards in `test/fixtures`.

Source layout: `src/extension` (extension host), `src/shared` (file format, protocol, paths – used by both sides, must not import `vscode`), `webview/src` (React + React Flow UI).

### Manual test checklist

Run through this in the Extension Development Host before a release.

- [ ] Opening `test/fixtures/sample.canvas` shows the board; **Reopen Editor With… → Text Editor** shows JSON.
- [ ] `empty.canvas` opens as an empty board; the first edit writes valid JSON. A file with broken JSON shows the error overlay and **Open as text** works; the board never overwrites it.
- [ ] Create each object type from the left toolbar; Esc returns to the Select tool.
- [ ] Drag, box-select, Shift+click, resize (sticky stays square), grid on/off with snapping.
- [ ] Snapping: drag a sticky next to a rectangle: magenta guides appear at aligned edges, the sticky jumps into place, guides go away on release. Same at 25 % and 300 % zoom (pull distance and guide width look the same on screen).
- [ ] Snapping while resizing: drag the corner handle near another object's edge: the right/bottom edge jumps onto it with a guide; a sticky stays square. Ctrl/Cmd turns it off.
- [ ] Snapping: hold Ctrl (Cmd on Mac) mid-drag: guides go away and the object follows the pointer; release: it snaps again without moving the mouse.
- [ ] Snapping with grid on: objects snap to edges of off-grid objects, and to the grid otherwise; resize still snaps to the grid. One undo after a snapped drag restores the start position. Objects outside the visible area are never snapped to.
- [ ] Text toolbar: font size, colour, alignment, bold, delete. Each change is one undo step.
- [ ] Draw a line to an object, to a ball, and to empty space (chooser, including file and link). Esc cancels the chooser.
- [ ] Line toolbar: arrows, label (empty label disappears), delete. Drag a line end along its object and to another object; drop on empty space cancels.
- [ ] Copy / paste (at the mouse), duplicate, delete, right-click menus. Paste plain text creates a sticky.
- [ ] Undo / redo after every action above restores the previous state. In a text field, Ctrl+Z undoes the text only.
- [ ] File reference: preview, edit and save a `.md`; open it in a tab and change it there (live refresh); change it while editing (conflict banner, Reload / Overwrite); invalid `.json` shows the warning icon; delete the file (missing state) and restore it; a file over 1 MB shows "File too large to preview".
- [ ] Hold Shift and drop files from the Explorer onto the board.
- [ ] Mouse wheel zooms, trackpad scroll pans, pinch zooms, Space+drag pans; zoom controls and the 100 % reset work. Pan/zoom survives a tab switch.
- [ ] Link: double-click opens the browser; right-click → Edit URL; non-http URLs are rejected.
