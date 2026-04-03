const socket = io({ transports: ['websocket'] });

// --- Landing Page Logic ---
document.addEventListener('DOMContentLoaded', () => {
    const landing = document.getElementById('landing-page');
    const app = document.getElementById('app-container');
    const startBtn = document.getElementById('start-btn');
    
    if (landing && app && startBtn) {
        if (sessionStorage.getItem('aircable-started')) {
            landing.style.display = 'none';
            app.classList.remove('hidden-app');
        } else {
            startBtn.addEventListener('click', () => {
                sessionStorage.setItem('aircable-started', 'true');
                landing.style.opacity = '0';
                setTimeout(() => {
                    landing.style.display = 'none';
                    app.classList.remove('hidden-app');
                }, 150);
            });
        }
    }

    // --- Tabs switching logic ---
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => {
                c.classList.remove('active');
                c.style.display = 'none';
            });
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-tab');
            const targetContent = document.getElementById(targetId);
            targetContent.classList.add('active');
            targetContent.style.display = 'block';
        });
    });

    // Check for incoming PWA Share Target file
    const urlParams = new URLSearchParams(window.location.search);
    const sharedId = urlParams.get('sharedId');
    if (sharedId) {
        fetch(`/api/shared-file/${sharedId}`)
            .then(res => res.blob())
            .then(blob => {
                // Determine filename (if possible) or just use generic
                const filename = "shared-file"; 
                const file = new File([blob], filename, { type: blob.type });
                window.pendingPastedFile = file; // Use same logic as paste
                showToast(`Share Ready! Tap a device to send file.`, 5000);
            })
            .catch(err => console.error('Share fetch error:', err));
            
        // Clean URL to prevent re-share on reload
        window.history.replaceState({}, document.title, "/");
    }
});

function showToast(msg, duration = 3000) {
    const toast = document.getElementById('paste-toast');
    if (toast) {
        toast.innerHTML = `<i class="fa-solid fa-paperclip"></i> ${msg}`;
        toast.className = 'show';
        setTimeout(() => toast.className = 'hidden', duration);
    }
}

// Request Notification Permission
if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
    document.addEventListener('click', () => {
        Notification.requestPermission();
    }, { once: true });
}
const peerConnections = {};
const dataChannels = {};
const pendingIceCandidates = {};
let myId = null;
const CHUNK_SIZE = 64 * 1024; // 64 KB chunks

// Device info
const deviceType = /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop';

// Vercel Warning Banner
if (window.location.hostname.includes('vercel.app')) {
    const warning = document.createElement('div');
    warning.style.cssText = 'background: red; color: white; padding: 15px; text-align: center; font-weight: bold; position: fixed; top: 0; left: 0; width: 100%; z-index: 9999; box-shadow: 0 4px 6px rgba(0,0,0,0.3);';
    warning.innerHTML = `⚠️ CRITICAL ERROR: You are running this on Vercel.<br>Vercel is a "Serverless" platform and drops WebSocket connections. The "Accept" popup will never appear on the other device because the message gets lost! <br>👉 Please run this locally on your computer (http://localhost:3000) or deploy to a persistent server like Render.`;
    document.body.prepend(warning);
}

let myName = localStorage.getItem('celron_device_name');

if (!myName) {
    myName = `${deviceType} ` + Math.floor(Math.random() * 9000 + 1000);
    localStorage.setItem('celron_device_name', myName);
}

const nameEl = document.getElementById('my-name');
nameEl.textContent = myName;
nameEl.style.cursor = 'pointer';
nameEl.title = 'Click to edit your device name';
nameEl.style.borderBottom = '1px dashed currentColor';

nameEl.addEventListener('click', () => {
    const newName = prompt('Enter a real name for this device (e.g. Ramesh Laptop):', myName);
    if (newName && newName.trim().length > 0) {
        myName = newName.trim();
        nameEl.textContent = myName;
        localStorage.setItem('celron_device_name', myName);
        if (myId) {
            socket.emit('register', { name: myName, deviceType });
        }
    }
});

// Fetch Local IP info
fetch('/api/address')
    .then(res => res.json())
    .then(data => {
        document.getElementById('local-url').textContent = data.url;
        document.getElementById('qr-code').src = data.qr;
    });

// Copy URL logic
document.getElementById('url-badge-container').addEventListener('click', () => {
    const urlText = document.getElementById('local-url').textContent;
    if (urlText && urlText !== 'Loading...') {
        navigator.clipboard.writeText(urlText).then(() => {
            const icon = document.getElementById('copy-icon');
            icon.className = 'fa-solid fa-check';
            setTimeout(() => icon.className = 'fa-regular fa-copy', 2000);
        });
    }
});

// Socket Events
socket.on('connect', () => {
    myId = socket.id;
    socket.emit('register', { name: myName, deviceType });
    document.querySelector('.status-indicator').classList.add('online');
});

socket.on('disconnect', () => {
    document.querySelector('.status-indicator').classList.remove('online');
});

// Support for dismissing redundant nodes locally
window.dismissedPeers = new Set();
window.dismissPeer = (peerId) => {
    window.dismissedPeers.add(peerId);
    // Request update to redraw everything
    socket.emit('request-peers-update'); 
};

socket.on('peers-update', (peers) => {
    const peersList = document.getElementById('peers-list');
    peersList.innerHTML = '';
    
    // Filter self out AND filter dismissed nodes
    const otherPeers = peers.filter(p => p.id !== myId && !window.dismissedPeers.has(p.id));
    document.getElementById('peer-count').textContent = otherPeers.length;

    // Detect duplicate names to show the helpful hint
    const nameCounts = {};
    let hasDuplicates = false;
    otherPeers.forEach(p => {
        nameCounts[p.name] = (nameCounts[p.name] || 0) + 1;
        if (nameCounts[p.name] > 1) hasDuplicates = true;
    });
    
    const hint = document.getElementById('duplicate-node-hint');
    if (hint) {
        if (hasDuplicates) {
            hint.classList.remove('hidden');
        } else {
            hint.classList.add('hidden');
        }
    }

    // Update global peer tracking for paste-to-send feature
    activePeersData = {};
    otherPeers.forEach(p => activePeersData[p.id] = p);

    if (otherPeers.length === 0) {
        peersList.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-satellite-dish"></i>
                <p>Looking for nearby devices...</p>
            </div>
        `;
        return;
    }

    otherPeers.forEach(peer => {
        const icon = peer.deviceType === 'Mobile' ? 'fa-mobile-screen-button' : 'fa-desktop';
        const card = document.createElement('div');
        card.className = 'peer-card';
        card.innerHTML = `
            <button class="dismiss-peer-btn" title="Hide this node" onclick="event.stopPropagation(); window.dismissPeer('${peer.id}')">
                <i class="fa-solid fa-xmark"></i>
            </button>
            <div class="peer-icon"><i class="fa-solid ${icon}"></i></div>
            <div class="peer-name" title="${peer.name}">${peer.name}</div>
            <div class="peer-type">${peer.deviceType}</div>
            <div class="send-overlay">
                <i class="fa-solid fa-cloud-arrow-up"></i>
                <span>Send File</span>
            </div>
        `;
        
        card.addEventListener('click', () => {
            selectFileForPeer(peer.id, peer.name);
        });

        // Drag and drop for peer card
        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            card.classList.add('drag-over');
        });

        card.addEventListener('dragleave', () => {
            card.classList.remove('drag-over');
        });

        card.addEventListener('drop', (e) => {
            e.preventDefault();
            card.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                // If it's the pending pasted file, prioritize it
                const fileToSend = window.pendingPastedFile || files[0];
                sendFile(fileToSend, peer.id, peer.name);
                window.pendingPastedFile = null; // Clear after use
            }
        });

        peersList.appendChild(card);
    });
});

document.getElementById('refresh-btn').addEventListener('click', () => {
    socket.disconnect();
    setTimeout(() => socket.connect(), 500);
});

// File selection mechanism
let selectedPeerId = null;
let selectedPeerName = null;
let currentFile = null;

function selectFileForPeer(peerId, peerName) {
    selectedPeerId = peerId;
    selectedPeerName = peerName;
    document.getElementById('file-input').click();
}

document.getElementById('file-input').addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0 && selectedPeerId) {
        sendFile(e.target.files[0], selectedPeerId, selectedPeerName || "Selected Device");
        e.target.value = ''; // Reset input to allow sending the same file again
    }
});

// --- WebRTC signaling & transfers ---

// Create an RTC Peer Connection
function getPeerConnection(targetId) {
    if (peerConnections[targetId]) return peerConnections[targetId];

    const pc = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { 
               urls: 'turn:openrelay.metered.ca:80',
               username: 'openrelayproject',
               credential: 'openrelayproject'
            },
            { 
               urls: 'turn:openrelay.metered.ca:443',
               username: 'openrelayproject',
               credential: 'openrelayproject'
            }
        ]
    });

    peerConnections[targetId] = pc;

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { target: targetId, candidate: event.candidate });
        }
    };

    pc.ondatachannel = (event) => {
        const receiveChannel = event.channel;
        setupDataChannel(receiveChannel, targetId);
    };

    return pc;
}

const activeTransfers = {}; // UI tracking

// When we WANT to send a file
async function sendFile(file, targetId, targetName) {
    const pc = getPeerConnection(targetId);
    pc.outgoingFile = file;
    
    // Create Data Channel
    const sendChannel = pc.createDataChannel('fileTransfer');
    sendChannel.binaryType = 'arraybuffer';
    setupDataChannel(sendChannel, targetId);

    // Send Offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    // Send file metadata with the offer via Socket
    socket.emit('offer', { 
        target: targetId, 
        sdp: offer,
        meta: {
            name: file.name,
            size: file.size,
            type: file.type
        }
    });

    // Fail-safe: If WebRTC fails to open within 8 seconds, fallback to server relay
    pc.fallbackTimeout = setTimeout(() => {
        if (sendChannel.readyState !== 'open') {
             console.log("WebRTC timeout! Falling back to WebSockets relay.");
             updateTransferStatus(targetId, 'Relaying via Cloud...', 'sending');
             sendFileInChunksSocket(file, targetId);
             // Optionally close WebRTC channel here
        }
    }, 8000);

    addTransferUI(targetId, file.name, file.size, `Waiting for ${targetName}...`, 'sending');
    console.log(`Initiating transfer of ${file.name} to ${targetId}`);
    
    alert(`File sent to ${targetName}!\n\nPlease go to that physical device and click "Accept" to start the transfer.`);
}

// Handling Incoming Offer
const transferModal = document.getElementById('transfer-modal');
let pendingIncomingOffer = null;

socket.on('offer', async (data) => {
    console.log("Incoming offer from", data.sender);
    pendingIncomingOffer = data;
    
    // Show Modal
    const mbSize = (data.meta.size / (1024*1024)).toFixed(2);
    document.getElementById('modal-filename').textContent = data.meta.name;
    document.getElementById('modal-filesize').textContent = `(${mbSize} MB)`;
    transferModal.classList.remove('hidden');
});

document.getElementById('btn-reject').addEventListener('click', () => {
    transferModal.classList.add('hidden');
    if (pendingIncomingOffer) {
        socket.emit('cancel-transfer', { target: pendingIncomingOffer.sender });
        pendingIncomingOffer = null;
    }
});

document.getElementById('btn-accept').addEventListener('click', async () => {
    transferModal.classList.add('hidden');
    if (!pendingIncomingOffer) return;

    const data = pendingIncomingOffer;
    const pc = getPeerConnection(data.sender);
    
    addTransferUI(data.sender, data.meta.name, data.meta.size, 'Connecting...', 'receiving');
    
    // Store metadata for receiving
    pc.incomingFileMeta = data.meta;
    
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    
    if (pendingIceCandidates[data.sender]) {
        for (let candidate of pendingIceCandidates[data.sender]) {
            try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { console.error(e); }
        }
        delete pendingIceCandidates[data.sender];
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('answer', {
        target: data.sender,
        sdp: answer
    });

    pendingIncomingOffer = null;
});

socket.on('answer', async (data) => {
    updateTransferStatus(data.sender, 'Connecting P2P...', 'sending');
    const pc = peerConnections[data.sender];
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (pendingIceCandidates[data.sender]) {
            for (let candidate of pendingIceCandidates[data.sender]) {
                try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { console.error(e); }
            }
            delete pendingIceCandidates[data.sender];
        }
    }
});

socket.on('ice-candidate', async (data) => {
    const pc = peerConnections[data.sender];
    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (e) { console.error(e); }
    } else {
        if (!pendingIceCandidates[data.sender]) pendingIceCandidates[data.sender] = [];
        pendingIceCandidates[data.sender].push(data.candidate);
    }
});

socket.on('transfer-cancelled', (data) => {
    updateTransferStatus(data.sender, 'Cancelled', 'error');
    if (peerConnections[data.sender]) {
        peerConnections[data.sender].close();
        delete peerConnections[data.sender];
    }
});

// Transfer Logic
function setupDataChannel(channel, peerId) {
    dataChannels[peerId] = channel;

    // Receive States
    let receiveBuffer = [];
    let receivedSize = 0;
    
    channel.onopen = () => {
        const pc = peerConnections[peerId];
        if (pc && pc.fallbackTimeout) clearTimeout(pc.fallbackTimeout);

        if (pc && pc.outgoingFile && channel.label === 'fileTransfer' && pc.localDescription && pc.localDescription.type === 'offer') {
            updateTransferStatus(peerId, 'Transferring P2P...', 'sending');
            sendFileInChunks(channel, pc.outgoingFile, peerId);
            pc.outgoingFile = null;
        } else {
            updateTransferStatus(peerId, 'Receiving P2P...', 'receiving');
        }
    };

    channel.onmessage = (event) => {
        if (typeof event.data === 'string') {
            if (event.data === 'DONE') {
                const pc = peerConnections[peerId];
                const meta = pc.incomingFileMeta;
                
                const blob = new Blob(receiveBuffer);
                const url = URL.createObjectURL(blob);
                
                finishTransferUI(peerId, meta.name, url);

                receiveBuffer = [];
                receivedSize = 0;
                channel.close();
            }
        } else {
            // Receiving chunk
            receiveBuffer.push(event.data);
            receivedSize += event.data.byteLength;
            
            const meta = peerConnections[peerId].incomingFileMeta;
            if (meta) {
                updateProgress(peerId, receivedSize, meta.size);
            }
        }
    };

    channel.onclose = () => {
        console.log(`Channel to ${peerId} closed.`);
        if (peerConnections[peerId]) {
            peerConnections[peerId].close();
            delete peerConnections[peerId];
        }
    };
}

function sendFileInChunks(channel, file, peerId) {
    let offset = 0;
    
    // Max buffer 16MB for ultra-fast transfer, pause if we exceed this
    const MAX_BUFFER = 16 * 1024 * 1024; 
    channel.bufferedAmountLowThreshold = 8 * 1024 * 1024; // Wake up logic when dropped to 8MB

    const sendNextChunk = () => {
        if (channel.readyState !== 'open') return;

        // If file is fully sent, notify receiver
        if (offset >= file.size) {
            channel.send('DONE');
            updateTransferStatus(peerId, 'Completed', 'done');
            
            const tui = activeTransfers[peerId];
            if (tui) {
                tui.container.classList.add('pulse-animation');
                setTimeout(() => tui.container.classList.remove('pulse-animation'), 2000);
            }
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('File Sent', {
                    body: `Successfully sent ${file.name} to ${peers[peerId]?.name || 'device'}.`,
                    icon: 'logo.png'
                });
            }
            setTimeout(() => {
                moveToHistory(peerId);
            }, 1000);
            return;
        }

        // Extremely fast buffer management without artificial delays
        if (channel.bufferedAmount > MAX_BUFFER) {
            const listener = () => {
                channel.removeEventListener('bufferedamountlow', listener);
                sendNextChunk();
            };
            channel.addEventListener('bufferedamountlow', listener);
            return;
        }

        const slice = file.slice(offset, offset + CHUNK_SIZE);
        slice.arrayBuffer().then(buffer => {
            channel.send(buffer);
            offset += buffer.byteLength;
            updateProgress(peerId, offset, file.size);
            sendNextChunk();
        });
    };
    sendNextChunk();
}

// --- Relay Fallback Logic ---
function sendFileInChunksSocket(file, targetId) {
    let offset = 0;
    const sendNextChunk = () => {
        if (offset >= file.size) {
            socket.emit('relay-done', { target: targetId });
            updateTransferStatus(targetId, 'Completed', 'done');
            setTimeout(() => moveToHistory(targetId), 1000); // Small delay to let UI show completed
            return;
        }
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        slice.arrayBuffer().then(buffer => {
            socket.emit('relay-chunk', { target: targetId, chunk: buffer });
            offset += buffer.byteLength;
            updateProgress(targetId, offset, file.size);
            setTimeout(sendNextChunk, 10);
        });
    };
    sendNextChunk();
}

const relayBuffer = {};
socket.on('relay-chunk', (data) => {
    if (!relayBuffer[data.sender]) relayBuffer[data.sender] = { buffer: [], size: 0 };
    relayBuffer[data.sender].buffer.push(data.chunk);
    relayBuffer[data.sender].size += data.chunk.byteLength;
    
    const pc = peerConnections[data.sender];
    if (pc && pc.incomingFileMeta) {
        updateProgress(data.sender, relayBuffer[data.sender].size, pc.incomingFileMeta.size);
        updateTransferStatus(data.sender, 'Receiving Relay...', 'receiving');
    }
});

socket.on('relay-done', (data) => {
    const rData = relayBuffer[data.sender];
    if (rData) {
        const pc = peerConnections[data.sender];
        const meta = pc ? pc.incomingFileMeta : {name: 'file'};
        const blob = new Blob(rData.buffer);
        const url = URL.createObjectURL(blob);
        finishTransferUI(data.sender, meta.name, url);
        delete relayBuffer[data.sender];
    }
});

function finishTransferUI(peerId, filename, url) {
    const tui = activeTransfers[peerId];
    if (tui) {
        tui.statusEl.textContent = 'Completed';
        tui.statusEl.className = 'transfer-status status-done';
        tui.progressEl.style.width = '100%';
        tui.actionsEl.innerHTML = `<a href="${url}" download="${filename}"><i class="fa-solid fa-download"></i> Download</a>`;
        tui.container.classList.add('pulse-animation');
        setTimeout(() => tui.container.classList.remove('pulse-animation'), 2000);
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('AirCable', { body: `Received: ${filename}` });
        }
        
        // Move to history after a short delay to let the user see the "Completed" state
        setTimeout(() => {
            moveToHistory(peerId);
        }, 1000);
    }
}

function moveToHistory(peerId) {
    const tui = activeTransfers[peerId];
    if (!tui) return;

    const historyList = document.getElementById('history-list');
    const emptyState = historyList.querySelector('.empty-state');
    
    // Hide empty state if it exists
    if (emptyState) {
        emptyState.style.display = 'none';
    }

    // Move the container to history list
    const container = tui.container;
    
    // Remove individual tracking but keep the UI element
    delete activeTransfers[peerId];
    
    // Add to history list
    historyList.prepend(container);
    
    // Remove progress bar from history items to keep it clean
    const progressBar = container.querySelector('.progress-bar-container');
    if (progressBar) {
        progressBar.style.display = 'none';
    }

    console.log(`Moved transfer ${peerId} to history.`);
}


// UI Helpers
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function addTransferUI(peerId, filename, filesize, statusMsg, typeClass) {
    const list = document.getElementById('transfers-list');
    
    const item = document.createElement('div');
    item.className = 'transfer-item';
    
    const icon = typeClass === 'sending' ? 'fa-arrow-up' : 'fa-arrow-down';
    
    item.innerHTML = `
        <div class="transfer-header">
            <div class="transfer-info">
                <i class="fa-solid ${icon} transfer-icon ${typeClass === 'receiving' ? 'status-receiving' : 'status-sending'}"></i>
                <div class="transfer-details">
                    <h4>${filename}</h4>
                    <p>${formatBytes(filesize)}</p>
                </div>
            </div>
            <div class="transfer-actions">
                <span class="transfer-status status-${typeClass}" id="status-${peerId}">${statusMsg}</span>
            </div>
        </div>
        <div class="progress-bar-container">
            <div class="progress-bar" id="progress-${peerId}"></div>
        </div>
    `;
    
    list.prepend(item); // Add to top

    activeTransfers[peerId] = {
        container: item,
        statusEl: item.querySelector(`#status-${peerId}`),
        progressEl: item.querySelector(`#progress-${peerId}`),
        actionsEl: item.querySelector('.transfer-actions')
    };
}

function updateProgress(peerId, current, total) {
    const tui = activeTransfers[peerId];
    if (tui) {
        const percent = (current / total) * 100;
        tui.progressEl.style.width = `${percent}%`;
    }
}

function updateTransferStatus(peerId, msg, typeClass) {
    const tui = activeTransfers[peerId];
    if (tui) {
        tui.statusEl.textContent = msg;
        tui.statusEl.className = `transfer-status status-${typeClass}`;
    }
}

// --- Help Modal Logic ---
// --- Header Buttons Logic ---
document.getElementById('secret-btn').addEventListener('click', () => {
    const code = prompt("Want to share files with someone on a different Wi-Fi?\n\nEnter a secret 4-digit room code to join them (e.g. 1234):");
    if (code && code.trim().length > 0) {
        socket.emit('join-room', code.trim());
        alert(`You are now securely paired! Devices matching code ${code.trim()} will appear below.`);
    }
});

const helpBtn = document.getElementById('help-btn');
const closeHelpBtn = document.getElementById('close-help-btn');
const helpModal = document.getElementById('help-modal');

if(helpBtn && closeHelpBtn && helpModal) {
    helpBtn.addEventListener('click', () => {
        helpModal.classList.remove('hidden');
    });

    closeHelpBtn.addEventListener('click', () => {
        helpModal.classList.add('hidden');
    });

    helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) {
            helpModal.classList.add('hidden');
        }
    });
}

// --- WhatsApp-style Paste-to-Send ---
document.addEventListener('paste', async (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    let file = null;
    for (const item of items) {
        if (item.kind === 'file') {
            file = item.getAsFile();
            break;
        }
    }

    if (file) {
        // Find if there's only one peer
        const peerCards = document.querySelectorAll('.peer-card');
        if (peerCards.length === 1) {
            // Auto-send if only one device is connected
            const peerName = peerCards[0].querySelector('.peer-name').textContent;
            // The peerId is stored in the data structure, we can find it by looking for the click listener or the global peers object
            // Here we'll just use a simplified prompt for the user
            const confirmSend = confirm(`Pasted file detected! Send "${file.name}" to ${peerName}?`);
            if (confirmSend) {
                // Find peer ID from the global state (Object.keys(peerConnections) or similar)
                const peerId = Object.keys(activePeersData || {})[0]; // We'll need to define this
                if (peerId) sendFile(file, peerId, peerName);
            }
        } else if (peerCards.length > 1) {
            alert(`File "${file.name}" ready to send! Now click the device on screen to share it.`);
            window.pendingPastedFile = file;
        } else {
             alert("No devices found nearby. Open AirCable on another device to send your pasted file!");
        }
    }
});

// Intercept clicks to use pending pasted file
document.addEventListener('click', (e) => {
    if (window.pendingPastedFile) {
        const card = e.target.closest('.peer-card');
        if (card) {
            // Finding the peer ID from the peer-card is tricky since it's an anonymous listener
            // Re-render handled the ID on the button so we can find it there
            const peerId = card.querySelector('.dismiss-peer-btn')?.getAttribute('data-id');
            const peerName = card.querySelector('.peer-name')?.textContent;
            if (peerId) sendFile(window.pendingPastedFile, peerId, peerName);
            window.pendingPastedFile = null;
        }
    }
});
