const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const MAP_FILE = path.join(__dirname, 'maps', 'store_map_3260.json');

app.use(express.static(path.join(__dirname, '../client')));
app.use(express.json());

// Load map JSON
app.get('/map', (req, res) => {
    fs.readFile(MAP_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).send(err);
        res.send(JSON.parse(data));
    });
});

// Save map JSON
app.post('/map', (req, res) => {
    fs.writeFile(MAP_FILE, JSON.stringify(req.body), (err) => { // <-- no pretty-print
        if (err) return res.status(500).send(err);
        res.send({status: 'ok'});
        io.emit('mapUpdate', req.body);  // broadcast update to all clients
    });
});

// Save map JSON
app.post('/save-map', (req, res) => {
    const updatedMap = req.body;
    fs.writeFileSync('map.json', JSON.stringify(updatedMap, null, 2));
    res.sendStatus(200);
});

// WebSocket connection for live updates
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.on('updateShelf', (data) => {
        io.emit('updateShelf', data);  // broadcast to other clients
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
