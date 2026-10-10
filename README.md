# ISO Video

Transform website screenshots into stunning isometric videos with cinematic 3D effects.

## Features

- **Website Capture**: Enter any URL to capture full-page screenshots with automatic section detection
- **Isometric 3D Preview**: WebGL preview with real perspective, framed at the export's aspect ratio, so what you see is exactly what exports
- **Timeline Editor**: Drag-and-drop scene reordering with playback controls
- **Multiple Presets**: Product Hunt, Dynamic, Minimal and Social styles, with entry and exit animations and camera moves
- **Video Export**: MP4 (H.264 + AAC), WebM (VP9 + Opus) and GIF, encoded with WebCodecs faster than real time, with your background music mixed in
- **Saved Projects**: The current video is kept in the browser (IndexedDB) and survives a reload
- **Dark/Light Theme**: System-aware theme with manual toggle

## Getting Started

### Prerequisites

- Node.js 22.12+ (Vercel runs 24.x)
- npm or yarn
- Google Chrome (local captures drive the installed browser)

### Installation

```bash
# Clone the repository
git clone https://github.com/sethihq/iso-video.git
cd iso-video

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm start
```

## Usage

1. **Enter a URL**: Paste any website URL in the input field
2. **Capture**: Click "Capture" to screenshot the website sections
3. **Customize**: Adjust timing, transitions, and visual settings
4. **Preview**: Use playback controls to preview the video
5. **Export**: Click "Export" to download the MP4 video

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Styling**: Tailwind CSS v4
- **State Management**: Zustand, with the React Compiler for memoization
- **Drag & Drop**: dnd-kit
- **Rendering**: one WebGL2 renderer (`lib/render`) shared by the preview and every export
- **Screenshots**: puppeteer-core with @sparticuz/chromium-min on Vercel
- **Video Export**: WebCodecs through Mediabunny (MP4, WebM), gifenc (GIF)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` or `K` | Play/Pause |
| `Left Arrow` / `Right Arrow` | Seek 0.5s (2s with `Shift`) |
| `Home` / `End` | Go to start / end |
| `J` / `L` | Previous / next scene |
| `0`-`9` | Jump to 0-90% |
| `E` | Export video |
| `?` | Show shortcuts |

## Deploy on Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/sethihq/iso-video)

## License

MIT
