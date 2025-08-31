const mongoose = require('mongoose');
const dbURI = 'mongodb://localhost:27017/storemaps';

mongoose.connect(dbURI, { useNewUrlParser: true, useUnifiedTopology: true });

mongoose.connection.on('connected', () => {
  console.log(`Mongoose connected to ${dbURI}`);
});
mongoose.connection.on('error', err => {
  console.log('Mongoose connection error:', err);
});
mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected');
});

const gracefulShutdown = (msg) => {
  mongoose.connection.close(() => {
    console.log(`Mongoose disconnected through ${msg}`);
  });
};

process.once('SIGUSR2', () => {
  gracefulShutdown('nodemon restart');
  process.kill(process.pid, 'SIGUSR2');
});
process.on('SIGINT', () => {
  gracefulShutdown('app termination');
  process.exit(0);
});
process.on('SIGTERM', () => {
  gracefulShutdown('app shutdown');
  process.exit(0);
});

const Store = require('./models/store');
const Shelf = require('./models/shelf');
const Item = require('./models/item');
const ItemIndex = require('./models/itemIndex');
const Modular = require('./models/modular');
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

// Create a new store
app.post('/store', async (req, res) => {
  try {
    const store = new Store(req.body);
    await store.save();
    res.send({ status: 'ok', store });
  } catch (err) {
    res.status(500).send(err);
  }
});

// Get store by ID
app.get('/store/:id', async (req, res) => {
  try {
    const store = await Store.findOne({ id: Number(req.params.id) });
    if (!store) return res.status(404).send({ error: 'Store not found' });
    res.send(store);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Update store by ID
app.put('/store/:id', async (req, res) => {
  try {
    const store = await Store.findOneAndUpdate({ id: Number(req.params.id) }, req.body, { new: true });
    if (!store) return res.status(404).send({ error: 'Store not found' });
    res.send({ status: 'ok', store });
  } catch (err) {
    res.status(500).send(err);
  }
});

// delete store by ID
app.delete('/store/:id', async (req, res) => {
  try {
    const store = await Store.findOneAndDelete({ id: Number(req.params.id) });
    if (!store) return res.status(404).send({ error: 'Store not found' });
    res.send({ status: 'ok', store });
  } catch (err) {
    res.status(500).send(err);
  }
});

// Create a new shelf
app.post('/shelf', async (req, res) => {
  try {
    const shelf = new Shelf(req.body);
    await shelf.save();
    res.send({ status: 'ok', shelf });
  } catch (err) {
    res.status(500).send(err);
  }
});

// Get shelf by shelf ID and store ID
app.get('/shelf/:id', async (req, res) => {
  try {
    const shelf = await Shelf.findOne({ _id: req.params.id, store: req.body.store });
    if (!shelf) return res.status(404).send({ error: 'Shelf not found' });
    res.send(shelf);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Update shelf by ID and store ID
app.put('/shelf/:id', async (req, res) => {
  try {
    const shelf = await Shelf.findOneAndUpdate({ _id: req.params.id, store: req.body.store }, req.body, { new: true });
    if (!shelf) return res.status(404).send({ error: 'Shelf not found' });
    res.send({ status: 'ok', shelf });
  } catch (err) {
    res.status(500).send(err);
  }
});

// Delete shelf by ID and store ID
app.delete('/shelf/:id', async (req, res) => {
  try {
    const shelf = await Shelf.findOneAndDelete({ _id: req.params.id, store: req.body.store });
    if (!shelf) return res.status(404).send({ error: 'Shelf not found' });
    res.send({ status: 'ok', shelf });
  } catch (err) {
    res.status(500).send(err);
  }
});

// Create a new item
app.post('/item', async (req, res) => {
  try {
    const item = new Item(req.body);
    await item.save();
    res.send({ status: 'ok', item });
  } catch (err) {
    res.status(500).send(err);
  }
});

// Get item by ID
app.get('/item/:id', async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).send({ error: 'Item not found' });
    res.send(item);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Update item by ID
app.put('/item/:id', async (req, res) => {
  try {
    const item = await Item.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!item) return res.status(404).send({ error: 'Item not found' });
    res.send({ status: 'ok', item });
  } catch (err) {
    res.status(500).send(err);
  }
});

// Delete item by ID
app.delete('/item/:id', async (req, res) => {
  try {
    const item = await Item.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).send({ error: 'Item not found' });
    res.send({ status: 'ok', item });
  } catch (err) {
    res.status(500).send(err);
  }
});

// Create a new modular
app.post('/modular', async (req, res) => {
  try {
    const modular = new Modular(req.body);
    await modular.save();
    res.send({ status: 'ok', modular });
  } catch (err) {
    res.status(500).send(err);
  }
});

// Get modular by ID
app.get('/modular/:id', async (req, res) => {
  try {
    const modular = await Modular.findById(req.params.id);
    if (!modular) return res.status(404).send({ error: 'Modular not found' });
    res.send(modular);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Update modular by ID
app.put('/modular/:id', async (req, res) => {
  try {
    const modular = await Modular.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!modular) return res.status(404).send({ error: 'Modular not found' });
    res.send({ status: 'ok', modular });
  } catch (err) {
    res.status(500).send(err);
  }
});

// Delete modular by ID
app.delete('/modular/:id', async (req, res) => {
  try {
    const modular = await Modular.findByIdAndDelete(req.params.id);
    if (!modular) return res.status(404).send({ error: 'Modular not found' });
    res.send({ status: 'ok', modular });
  } catch (err) {
    res.status(500).send(err);
  }
});

// Create a new item index 
app.post('/itemindex', async (req, res) => {
  try {
    const itemIndex = new ItemIndex(req.body);
    await itemIndex.save();
    res.send({ status: 'ok', itemIndex });
  } catch (err) {
    res.status(500).send(err);
  }
});

// Get itemIndex by upc and store ID
app.get('/itemindex/upc/:upc/store/:storeId', async (req, res) => {
  try {
    const itemIndexes = await ItemIndex.find({ upc: req.params.upc, store: req.params.storeId });
    res.send(itemIndexes);
  } catch (err) {
    res.status(500).send(err);
  }
});

// update item index individually 
app.put('/itemindex', async (req, res) => {
  try {
    const { store, upcs } = req.body;
    // Use the first UPC as the unique key, or adapt for your schema
    const upc = Array.isArray(upcs) ? upcs[0] : upcs;
    const itemIndex = await ItemIndex.findOneAndUpdate(
      { store, upcs: upc },
      req.body,
      { upsert: true, new: true }
    );
    res.send({ status: 'ok', itemIndex });
  } catch (err) {
    res.status(500).send(err);
  }
});

// Update item index by upc and store ID
app.put('/itemindex/upc/:upc', async (req, res) => {
  try {
    const itemIndex = await ItemIndex.findOneAndUpdate({ upc: req.params.upc, store: req.body.store }, req.body, { new: true });
    if (!itemIndex) return res.status(404).send({ error: 'ItemIndex not found' });
    res.send({ status: 'ok', itemIndex });
  } catch (err) {
    res.status(500).send(err);
  }
});

// Delete item index by upc and store ID
app.delete('/itemindex/upc/:upc', async (req, res) => {
  try {
    const itemIndex = await ItemIndex.findOneAndDelete({ upc: req.params.upc, store: req.body.store });
    if (!itemIndex) return res.status(404).send({ error: 'ItemIndex not found' });
    res.send({ status: 'ok', itemIndex });
  } catch (err) {
    res.status(500).send(err);
  }
});

// generate item index for a store
app.post('/generate-itemindex/:storeId', async (req, res) => {
  try {
    const storeId = Number(req.params.storeId);
    const store = await Store.findOneAndUpdate({ id: storeId }).populate('shelves modulars items');
    if (!store) return res.status(404).send({ error: 'Store not found' });

    // Example: Build item index from shelves and modulars
    let itemIndexes = [];
    for (const shelf of store.shelves) {
      for (const modularId of shelf.modulars) {
        const modular = await Modular.findById(modularId);
        if (modular && modular.items) {
          for (const modItem of modular.items) {
            const item = await Item.findOne({ item_number: modItem.item_number });
            if (item) {
              itemIndexes.push({
                store: store._id,
                shelf: shelf._id,
                modular: modular._id,
                item: item._id,
                location: modItem.location,
                upc: item.upc
              });
            }
          }
        }
      }
    }
    // Save all item indexes
    await ItemIndex.insertMany(itemIndexes);
    res.send({ status: 'ok', count: itemIndexes.length });
  } catch (err) {
    res.status(500).send(err);
  }
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
