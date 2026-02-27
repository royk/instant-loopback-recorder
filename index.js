import easymidi from 'easymidi';
import midiModule from '@tonejs/midi';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

// Extract Midi class from the module
const { Midi } = midiModule;

// State management
let state = 'listening'; // 'listening', 'recording', 'playback'
let recordedMessages = [];
let input = null;
let output = null;
let recordingStartTime = null;
let playbackTimeouts = []; // Track playback timeouts so we can cancel them
let playbackCompleteTimeout = null; // Timeout for returning to listening state

// Sheet music viewing state
let sheetFiles = [];
let currentSheetIndex = 0;
let browser = null;
let sheetPage = null;
let sheetViewerInitialized = false;

// Discover available sheet music PDFs in ./sheet
function loadSheetFiles() {
  const sheetDir = path.join(process.cwd(), 'sheet');
  if (!fs.existsSync(sheetDir)) {
    console.warn('⚠️  Sheet directory not found:', sheetDir);
    sheetFiles = [];
    return;
  }

  const entries = fs.readdirSync(sheetDir);
  const pdfs = entries
    .filter((name) => name.toLowerCase().endsWith('.pdf'))
    .map((name) => path.join(sheetDir, name))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  if (pdfs.length === 0) {
    console.warn('⚠️  No PDF files found in sheet directory:', sheetDir);
  }

  sheetFiles = pdfs;
  currentSheetIndex = 0;
}

async function initializeSheetViewer() {
  if (sheetViewerInitialized) return;

  loadSheetFiles();
  if (sheetFiles.length === 0) {
    console.warn('⚠️  Cannot open sheet viewer: no PDFs found in ./sheet');
    return;
  }

  try {
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null, // let the browser window control the size
      args: [
        '--kiosk',
        '--start-fullscreen',
        '--no-default-browser-check',
        '--disable-infobars',
        '--allow-file-access-from-files',
        '--window-position=0,0',
        '--window-size=1920,1080',
      ],
    });

    sheetPage = await browser.newPage();

    const viewerPath = path.join(process.cwd(), 'sheet-viewer.html');
    const viewerUrl = `file://${viewerPath}`;
    await sheetPage.goto(viewerUrl);

    // Try to ensure the content is using the full screen
    await sheetPage.evaluate(() => {
      try {
        if (document.fullscreenEnabled && !document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
        if (typeof window.moveTo === 'function' && typeof window.resizeTo === 'function') {
          window.moveTo(0, 0);
          window.resizeTo(screen.width, screen.height);
        }
      } catch {
        // Ignore fullscreen/resize errors
      }
    });

    // Wait for viewer to be ready
    await sheetPage.waitForFunction(
      () => typeof window.loadPdf === 'function',
      { timeout: 10000 }
    );

    // Load the first sheet file
    const initialFile = sheetFiles[currentSheetIndex];
    await sheetPage.evaluate((filePath) => {
      window.loadPdf(filePath);
    }, initialFile);

    sheetViewerInitialized = true;
    console.log('✓ Sheet viewer initialized');
  } catch (error) {
    console.error('❌ Failed to initialize sheet viewer:', error);
    browser = null;
    sheetPage = null;
    sheetViewerInitialized = false;
  }
}

async function sheetNextPageWithWrap() {
  await initializeSheetViewer();
  if (!sheetViewerInitialized || !sheetPage) return;

  await sheetPage.evaluate(() => {
    if (typeof window.nextPageWithWrap === 'function') {
      window.nextPageWithWrap();
    } else if (typeof window.nextPage === 'function') {
      window.nextPage();
    }
  });
}

async function sheetPrevPageWithWrap() {
  await initializeSheetViewer();
  if (!sheetViewerInitialized || !sheetPage) return;

  await sheetPage.evaluate(() => {
    if (typeof window.prevPageWithWrap === 'function') {
      window.prevPageWithWrap();
    } else if (typeof window.prevPage === 'function') {
      window.prevPage();
    }
  });
}

async function sheetNextFile() {
  await initializeSheetViewer();
  if (!sheetViewerInitialized || !sheetPage || sheetFiles.length === 0) return;

  currentSheetIndex = (currentSheetIndex + 1) % sheetFiles.length;
  const filePath = sheetFiles[currentSheetIndex];

  await sheetPage.evaluate((fp) => {
    if (typeof window.loadPdf === 'function') {
      window.loadPdf(fp);
    }
  }, filePath);

  console.log('♪ Switched to sheet file:', path.basename(filePath));
}

// Initialize MIDI
function initializeMIDI() {
  try {
    // Find MIDI input (first available)
    const inputs = easymidi.getInputs();
    // if (inputs.length === 0) {
    //   console.log('❌ No MIDI input devices found');
    //   process.exit(1);
    // }
    
    // Find MIDI output (first available)
    const outputs = easymidi.getOutputs();
    // if (outputs.length === 0) {
    //   console.log('❌ No MIDI output devices found');
    //   process.exit(1);
    // }
    if (inputs.length === 0 & outputs.length === 0) {
      console.log('❌ No MIDI input or output devices found');
      return;
    }
    input = new easymidi.Input(inputs[0]);
    output = new easymidi.Output(outputs[0]);
    
    console.log(`✓ Connected to MIDI input: ${inputs[0]}`);
    console.log(`✓ Connected to MIDI output: ${outputs[0]}`);
    
    // Set up MIDI input handler
    input.on('noteon', (msg) => handleMIDIMessage('noteon', msg));
    input.on('noteoff', (msg) => handleMIDIMessage('noteoff', msg));
    input.on('cc', (msg) => handleMIDIMessage('cc', msg));
    input.on('program', (msg) => handleMIDIMessage('program', msg));
    input.on('channel aftertouch', (msg) => handleMIDIMessage('channel aftertouch', msg));
    input.on('poly aftertouch', (msg) => handleMIDIMessage('poly aftertouch', msg));
    input.on('pitch', (msg) => handleMIDIMessage('pitch', msg));
    input.on('position', (msg) => handleMIDIMessage('position', msg));
    input.on('mtc', (msg) => handleMIDIMessage('mtc', msg));
    input.on('select', (msg) => handleMIDIMessage('select', msg));
    input.on('clock', (msg) => handleMIDIMessage('clock', msg));
    input.on('start', (msg) => handleMIDIMessage('start', msg));
    input.on('continue', (msg) => handleMIDIMessage('continue', msg));
    input.on('stop', (msg) => handleMIDIMessage('stop', msg));
    input.on('activesense', (msg) => handleMIDIMessage('activesense', msg));
    input.on('reset', (msg) => handleMIDIMessage('reset', msg));
    
  } catch (error) {
    console.error('Error initializing MIDI:', error);
    process.exit(1);
  }
}

// Handle incoming MIDI messages
function handleMIDIMessage(type, msg) {
  if (state === 'listening') {
    // Auto-start recording on noteon (note down) or sustain pedal (CC 64)
    if (type === 'noteon') {
      startRecording();
      recordMessage(type, msg);
    } else if (type === 'cc' && msg.controller === 64) {
      // Sustain pedal (CC 64) - start recording and record the pedal press
      startRecording();
      recordMessage(type, msg);
    }
    // Ignore other message types when in listening state
  } else if (state === 'recording') {
    // Record all messages while recording
    recordMessage(type, msg);
  } else if (state === 'playback') {
    // New noteon or sustain pedal during playback overwrites and starts new recording
    if (type === 'noteon') {
      startRecording();
      recordMessage(type, msg);
    } else if (type === 'cc' && msg.controller === 64) {
      // Sustain pedal (CC 64) - start recording and record the pedal press
      startRecording();
      recordMessage(type, msg);
    }
    // Ignore other message types during playback
  }
}

// Record a MIDI message with timestamp
function recordMessage(type, msg) {
  const timestamp = Date.now() - recordingStartTime;
  recordedMessages.push({
    type,
    msg: { ...msg },
    timestamp
  });
}

// Start recording
function startRecording() {
  if (state === 'recording') return;
  
  // Overwrite previous recording
  recordedMessages = [];
  recordingStartTime = Date.now();
  state = 'recording';
  console.log('🔴 Recording... (Press "s" to stop)');
}

// Stop recording and return to listening
function stopRecording() {
  if (state !== 'recording') return;
  
  state = 'listening';
  const duration = ((Date.now() - recordingStartTime) / 1000).toFixed(2);
  console.log(`✓ Recording stopped (${duration}s, ${recordedMessages.length} messages)`);
  console.log('👂 Listening for MIDI input... (Press "p" to play)');
}

// Play back recorded MIDI
function playBack() {
  if (state === 'playback') {
    console.log('⚠️  Already playing back');
    return;
  }
  
  if (recordedMessages.length === 0) {
    console.log('⚠️  No recorded MIDI to play');
    return;
  }
  
  state = 'playback';
  console.log(`▶️  Playing back ${recordedMessages.length} messages... (Press "s" to stop)`);
  
  // Clear any existing timeouts
  playbackTimeouts.forEach(timeout => clearTimeout(timeout));
  playbackTimeouts = [];
  if (playbackCompleteTimeout) {
    clearTimeout(playbackCompleteTimeout);
    playbackCompleteTimeout = null;
  }
  
  // Play back messages with original timing
  recordedMessages.forEach((recorded, index) => {
    const timeout = setTimeout(() => {
      try {
        output.send(recorded.type, recorded.msg);
      } catch (error) {
        console.error(`Error playing message ${index}:`, error);
      }
    }, recorded.timestamp);
    playbackTimeouts.push(timeout);
  });
  
  // Return to listening state after playback completes
  const totalDuration = recordedMessages[recordedMessages.length - 1].timestamp;
  playbackCompleteTimeout = setTimeout(() => {
    state = 'listening';
    console.log('✓ Playback complete');
    console.log('👂 Listening for MIDI input... (Press "p" to play)');
    playbackTimeouts = [];
    playbackCompleteTimeout = null;
  }, totalDuration + 100); // Add small buffer
}

// Stop playback and return to listening
function stopPlayback() {
  if (state !== 'playback') return;
  
  // Clear all playback timeouts
  playbackTimeouts.forEach(timeout => clearTimeout(timeout));
  playbackTimeouts = [];
  if (playbackCompleteTimeout) {
    clearTimeout(playbackCompleteTimeout);
    playbackCompleteTimeout = null;
  }
  
  state = 'listening';
  console.log('⏹️  Playback stopped');
  console.log('👂 Listening for MIDI input... (Press "p" to play)');
}

// Export recorded MIDI to file
function exportMIDI() {
  if (recordedMessages.length === 0) {
    console.log('⚠️  No recorded MIDI to export');
    return;
  }
  
  try {
    const midi = new Midi();
    const track = midi.addTrack();
    
    // Track active notes: Map of note number to {startTime (seconds), velocity, channel}
    const activeNotes = new Map();
    
    // Get the start time to normalize timestamps
    const startTime = recordedMessages[0].timestamp;
    const totalDuration = recordedMessages[recordedMessages.length - 1].timestamp - startTime;
    
    // Process all messages in order
    recordedMessages.forEach((recorded) => {
      // Convert timestamp to seconds (relative to start)
      const time = (recorded.timestamp - startTime) / 1000;
      
      if (recorded.type === 'noteon' && recorded.msg.velocity > 0) {
        const noteNum = recorded.msg.note;
        const channel = recorded.msg.channel || 0;
        const velocity = recorded.msg.velocity || 100;
        
        // If note already active, close it first
        if (activeNotes.has(noteNum)) {
          const noteInfo = activeNotes.get(noteNum);
          const duration = Math.max(0.001, time - noteInfo.startTime); // Minimum 1ms duration
          
          track.addNote({
            midi: noteNum,
            time: noteInfo.startTime,
            duration: duration,
            velocity: noteInfo.velocity,
            channel: channel
          });
          activeNotes.delete(noteNum);
        }
        
        // Start new note
        activeNotes.set(noteNum, {
          startTime: time,
          velocity: velocity,
          channel: channel
        });
      } else if (recorded.type === 'noteoff' || 
                 (recorded.type === 'noteon' && recorded.msg.velocity === 0)) {
        const noteNum = recorded.msg.note;
        
        if (activeNotes.has(noteNum)) {
          const noteInfo = activeNotes.get(noteNum);
          const duration = Math.max(0.001, time - noteInfo.startTime); // Minimum 1ms duration
          
          track.addNote({
            midi: noteNum,
            time: noteInfo.startTime,
            duration: duration,
            velocity: noteInfo.velocity,
            channel: noteInfo.channel
          });
          activeNotes.delete(noteNum);
        }
      } else if (recorded.type === 'cc') {
        // Control change events (like sustain pedal)
        track.addCC({
          number: recorded.msg.controller,
          value: recorded.msg.value,
          time: time,
          channel: recorded.msg.channel || 0
        });
      }
    });
    
    // Close remaining active notes
    const endTime = totalDuration / 1000;
    activeNotes.forEach((noteInfo, noteNum) => {
      const duration = Math.max(0.001, endTime - noteInfo.startTime);
      
      track.addNote({
        midi: noteNum,
        time: noteInfo.startTime,
        duration: duration,
        velocity: noteInfo.velocity,
        channel: noteInfo.channel
      });
    });
    
    // Write MIDI file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `piano-recording-${timestamp}.mid`;
    const filepath = path.join(process.cwd(), filename);
    
    const buffer = Buffer.from(midi.toArray());
    fs.writeFileSync(filepath, buffer);
    
    console.log(`💾 MIDI file exported: ${filename}`);
    console.log(`   Location: ${filepath}`);
  } catch (error) {
    console.error('❌ Error exporting MIDI file:', error.message);
    console.error(error.stack);
  }
}

// Set up terminal keyboard input
function setupKeyboardInput() {
  // Set terminal to raw mode to capture individual keypresses
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', (key) => {
    // Handle Ctrl+C
    if (key === '\u0003') {
      cleanup();
      return;
    }
    
    // Handle Ctrl+D (EOF)
    if (key === '\u0004') {
      cleanup();
      return;
    }
    
    // 's' to stop recording or stop playback
    if (key === 's' || key === 'S') {
      if (state === 'recording') {
        stopRecording();
      } else if (state === 'playback') {
        stopPlayback();
      }
      return;
    }
    
    // 'p' to play back
    if (key === 'p' || key === 'P') {
      playBack();
      return;
    }
    
    // 'e' to export MIDI file
    if (key === 'e' || key === 'E') {
      exportMIDI();
      return;
    }

    // '[' to go to previous page (with wrap within the current PDF)
    if (key === '[') {
      sheetPrevPageWithWrap().catch((error) => {
        console.error('Error moving to previous sheet page:', error);
      });
      return;
    }

    // ']' to go to next page (with wrap within the current PDF)
    if (key === ']') {
      sheetNextPageWithWrap().catch((error) => {
        console.error('Error moving to next sheet page:', error);
      });
      return;
    }

    // 'n' to go to next sheet file
    if (key === 'n' || key === 'N') {
      sheetNextFile().catch((error) => {
        console.error('Error moving to next sheet file:', error);
      });
      return;
    }
  });
  
  console.log('✓ Keyboard shortcuts enabled:');
  console.log('  - Press "s" to stop recording or stop playback');
  console.log('  - Press "p" to play back');
  console.log('  - Press "e" to export MIDI file');
  console.log('  - Press "[" for previous sheet page (wraps within file)');
  console.log('  - Press "]" for next sheet page (wraps within file)');
  console.log('  - Press "n" for next sheet file');
}

// Cleanup on exit
function cleanup() {
  console.log('\n👋 Shutting down...');
  // Close sheet viewer browser if open
  if (browser) {
    browser.close().catch(() => {
      // Ignore errors during shutdown
    });
    browser = null;
    sheetPage = null;
    sheetViewerInitialized = false;
  }
  // Restore terminal settings
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  if (input) input.close();
  if (output) output.close();
  process.exit(0);
}

// Main
async function main() {
  console.log('🎹 Piano Practice App');
  console.log('====================\n');

  initializeMIDI();
  setupKeyboardInput();

  console.log('\n👂 Listening for MIDI input... (Press "p" to play)');
  console.log('Press Ctrl+C to exit\n');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

// Handle process termination
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

