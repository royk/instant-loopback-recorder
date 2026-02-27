# Instant Loopback Recorder for MIDI

A Node.js CLI application for macOS that helps you practice piano by recording MIDI input and playing it back.

## Features

- **Automatic Recording**: Starts recording when MIDI input is detected
- **Terminal Keyboard Shortcuts**: Control the app using simple key presses in the terminal
- **MIDI Playback**: Play back your recorded performance with original timing
- **Export to MIDI File**: Save your performance as a `.mid` file
- **PDF Sheet Viewer**: Full-screen PDF sheet music viewer driven from the terminal
- **Simple CLI**: Clear status messages show what the app is doing

## Installation

1. Install dependencies:
```bash
npm install
```

## Usage

1. Start the app:
```bash
npm start
```

2. The app starts in **listening** mode, waiting for MIDI input. 

3. When you play your MIDI device, recording starts automatically. Specifically, recording starts on the following MIDI messages:
   - noteon
   - CC 64 (sustain)

4. **Keyboard Shortcuts** (press in the terminal):
   - `s`: Stop recording and return to listening mode
   - `p`: Play back the recorded MIDI
   - `e`: Export recording to file
   - `[` : Previous page of the current PDF sheet (wraps within the file)
   - `]` : Next page of the current PDF sheet (wraps within the file)
   - `n` : Next PDF sheet file (wraps to the first when at the last)

5. New MIDI input automatically overwrites the previous recording.

6. Press `Ctrl+C` to exit.

## Requirements

- macOS
- Node.js
- A MIDI input device (piano/keyboard)
- A MIDI output device (can be the same as input, or a virtual MIDI port)
- Chromium/Chrome (for the PDF sheet viewer; required on the target Debian mini PC)

## How It Works

- **Listening State**: Waiting for MIDI input. When MIDI is detected, automatically switches to recording.
- **Recording State**: Actively recording all MIDI messages with timestamps.
- **Playback State**: Playing back recorded MIDI messages with original timing.

The app automatically selects the first available MIDI input and output device.

