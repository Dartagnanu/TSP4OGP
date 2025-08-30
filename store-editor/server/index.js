const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/storemaps', { useNewUrlParser: true, useUnifiedTopology: true });

const shelfSchema = new mongoose.Schema({
  id: String,
  template: String,
  placement: [Number],
  rotation: Number,
  modulars: [String],
  flex_items: [Number],
  department: String
}, { _id: false }); 

const mapSchema = new mongoose.Schema({
  store_id: Number,
  map_size: Object,
  store_shape: Array,
  shelf_templates: Object,
  shelves: [shelfSchema],
  starting_points: Array,
  registers: Array
}, { collection: 'maps' });


const MapModel = mongoose.model('Map', mapSchema);
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




// TODO: reconfigure backend delete functions
// delete shelf by id off map by id
app.delete('/map/:id', (req, res) => {
    const shelfId = req.params.id;
    fs.readFile(MAP_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).send(err);
        const map = JSON.parse(data);
        delete map.shelves[shelfId];
        fs.writeFile(MAP_FILE, JSON.stringify(map, null, 2), (err) => {
            if (err) return res.status(500).send(err);
            res.send({status: 'ok'});
            io.emit('mapUpdate', map);
        });
    });
});

// WebSocket connection for live updates
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.on('updateShelf', (data) => {
        io.emit('updateShelf', data);  // broadcast to other clients
    });
});

// get map data by id
app.get('/map/:id', async (req, res) => {
  try {
    const map = await MapModel.findOne({ store_id: Number(req.params.id) });
    if (!map) return res.status(404).send({ error: 'Map not found' });
    res.send(map);
  } catch (err) {
    res.status(500).send(err);
  }
});

// post additional shelf to map by map id and shelfdata
app.post('/map/:id/shelf', async (req, res) => {
  try {
    const mapId = Number(req.params.id);
    const shelfData = req.body;
    const map = await MapModel.findOne({ store_id: mapId });
    if (!map) return res.status(404).send({ error: 'Map not found' });

    // Add shelf data to map
    map.shelves.push(shelfData);
    await map.save();
    res.send({ status: 'ok', map });
    io.emit('mapUpdate', map);
  } catch (err) {
    res.status(500).send(err);
  }
});

// post map data by id
app.post('/map/:id', async (req, res) => {
  try {
    const mapId = Number(req.params.id);
    const updatedMap = req.body;
    const result = await MapModel.findOneAndUpdate(
      { store_id: mapId },
      updatedMap,
      { upsert: true, new: true }
    );
    res.send({ status: 'ok', map: result });
    io.emit('mapUpdate', updatedMap);
  } catch (err) {
    res.status(500).send(err);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
