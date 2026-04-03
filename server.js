const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, { maxHttpBufferSize: 1e8 });
const os = require('os');
const path = require('path');
const QRCode = require('qrcode');

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limit
const sharedFiles = new Map();

// PWA Share Target Handler
app.post('/_share', upload.array('media'), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.redirect('/');
    }
    
    // We only take the first shared file for now
    const file = req.files[0];
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 7);
    
    sharedFiles.set(id, {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size
    });

    // Auto-cleanup after 5 minutes
    setTimeout(() => sharedFiles.delete(id), 5 * 60 * 1000);

    res.redirect(`/?sharedId=${id}`);
});

app.get('/api/shared-file/:id', (req, res) => {
    const file = sharedFiles.get(req.params.id);
    if (!file) return res.status(404).send('Shared file not found or expired.');
    
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalname}"`);
    res.send(file.buffer);
});

app.get('/api/address', async (req, res) => {
    try {
        // Detect if we are behind a proxy (like Render) or local
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers.host;
        const url = `${protocol}://${host}`;
        
        const qr = await QRCode.toDataURL(url);
        res.json({ url, qr });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

let peers = {};

io.on('connection', (socket) => {
    // Secure Network Grouping: Determine the client's physical IP address
    let clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    if (clientIp && clientIp.includes(',')) clientIp = clientIp.split(',')[0].trim();
    if (!clientIp) clientIp = 'default-net';
    
    // Assign them to a room based on their network
    socket.currentRoom = clientIp;
    socket.join(clientIp);

    socket.on('register', (data) => {
        peers[socket.id] = {
            id: socket.id,
            name: data.name || 'Anonymous ' + socket.id.substring(0, 4),
            deviceType: data.deviceType || 'Unknown',
            room: clientIp // Store their room
        };
        console.log(`[+] Peer registered: ${peers[socket.id].name} on Network: ${clientIp}`);
        broadcastToRoom(socket.currentRoom);
    });

    socket.on('join-room', (roomCode) => {
        const oldRoom = socket.currentRoom;
        socket.leave(oldRoom);
        
        const newRoom = `secret-${roomCode}`;
        socket.currentRoom = newRoom;
        socket.join(newRoom);
        
        if (peers[socket.id]) {
            peers[socket.id].room = newRoom;
        }
        console.log(`[*] Peer moved to secret room: ${newRoom}`);
        
        // Broadcast updates so the old room removes them, and new room sees them
        broadcastToRoom(oldRoom);
        broadcastToRoom(newRoom);
    });

    socket.on('offer', (data) => {
        io.to(data.target).emit('offer', {
            sdp: data.sdp,
            sender: socket.id,
            meta: data.meta
        });
    });

    socket.on('answer', (data) => {
        io.to(data.target).emit('answer', {
            sdp: data.sdp,
            sender: socket.id
        });
    });

    socket.on('ice-candidate', (data) => {
        io.to(data.target).emit('ice-candidate', {
            candidate: data.candidate,
            sender: socket.id
        });
    });

    socket.on('cancel-transfer', (data) => {
        io.to(data.target).emit('transfer-cancelled', {
            sender: socket.id
        });
    });

    socket.on('relay-chunk', (data) => {
        io.to(data.target).emit('relay-chunk', { sender: socket.id, chunk: data.chunk });
    });

    socket.on('relay-done', (data) => {
        io.to(data.target).emit('relay-done', { sender: socket.id });
    });

    socket.on('disconnect', () => {
        if (peers[socket.id]) {
            console.log(`[-] Peer disconnected: ${peers[socket.id].name} (${socket.id})`);
            const roomToUpdate = peers[socket.id].room;
            delete peers[socket.id];
            broadcastToRoom(roomToUpdate);
        }
    });

    function broadcastToRoom(room) {
        const roomPeers = Object.values(peers).filter(p => p.room === room);
        io.to(room).emit('peers-update', roomPeers);
    }
});

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                return alias.address;
            }
        }
    }
    return '0.0.0.0';
}

function bootServer(port) {
    return new Promise((resolve) => {
        server.listen(port, '0.0.0.0', () => {
            const actualPort = server.address().port;
            const ip = getLocalIp();
            const url = `http://${ip}:${actualPort}`;
            console.log(`\n===========================================`);
            console.log(`🚀 AirCable is running!`);
            console.log(`📂 Available on your local network at:`);
            console.log(`   --> ${url}`);
            console.log(`===========================================\n`);
            resolve(url);
        });
    });
}

if (require.main === module) {
    bootServer(PORT);
}

module.exports = { bootServer };
