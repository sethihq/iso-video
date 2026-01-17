# ISO Video

Transform website screenshots into stunning isometric videos with cinematic 3D effects.

## Features

- **Website Capture**: Enter any URL to capture full-page screenshots with automatic section detection
- **Isometric 3D Preview**: Real-time preview with customizable rotation, scale, and perspective
- **Timeline Editor**: Drag-and-drop scene reordering with playback controls
- **Multiple Presets**: Product Hunt, Dynamic, Social, and custom styles
- **Video Export**: High-quality MP4 export with smooth transitions
- **Dark/Light Theme**: System-aware theme with manual toggle

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

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

- **Framework**: Next.js 15 with App Router
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Drag & Drop**: dnd-kit
- **Screenshots**: Puppeteer
- **Video Export**: WebCodecs API

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `R` | Reset to start |
| `Left Arrow` | Previous scene |
| `Right Arrow` | Next scene |
| `E` | Export video |
| `?` | Show shortcuts |

## Deploy on Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/sethihq/iso-video)

## License

MIT
