import mongoose from 'mongoose';
import express from 'express';
import http from 'http';
import { Server as SocketIo } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

import Store from './models/store.js';
import Shelf from './models/shelf.js';
import Item from './models/item.js';
import Modular from './models/modular.js';
import ItemIndex from './models/itemIndex.js';
import Pickwalk from './models/pickwalk.js';
import StoreGraph from './models/storeGraph.js';



// Resolve __dirname in ES Modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017/storemaps';

mongoose.connect(mongoUrl)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

mongoose.connection.on('connected', () => {
  console.log(`Mongoose connected to ${mongoUrl}`);
});
mongoose.connection.on('error', err => {
  console.log('Mongoose connection error:', err);
});
mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected');
});

const app = express();
const server = http.createServer(app);
const io = new SocketIo(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// Serve the index.html file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// -------------------- Store Routes --------------------

// Create a new store
app.post('/store', async (req, res) => {
  try {
    const store = new Store(req.body);
    await store.save();
    res.status(201).send(store);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Get store by store number
app.get('/store/:number', async (req, res) => {
  try {
    const store = await Store.findOne({ store_number: req.params.number });
    if (!store) return res.status(404).send({ error: 'Store not found' });
    res.send(store);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Update store by store number
app.put('/store/:number', async (req, res) => {
  try {
    const store = await Store.findOneAndUpdate(
      { store_number: Number(req.params.number) },
      req.body,
      { new: true }
    );
    if (!store) return res.status(404).send({ error: 'Store not found' });
    res.send(store);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Delete store by store number
app.delete('/store/:number', async (req, res) => {
  try {
    const store = await Store.findOneAndDelete({ store_number: Number(req.params.number) });
    if (!store) return res.status(404).send({ error: 'Store not found' });
    res.send(store);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// -------------------- Shelf Routes --------------------

// Create a new shelf
app.post('/shelf', async (req, res) => {
  try {
    const shelf = new Shelf(req.body);
    await shelf.save();
    res.status(201).send(shelf);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Get shelf by ID
app.get('/shelf/:shelf_id', async (req, res) => {
  // TODO: fix search shelf by ID only
  throw new Error('search shelf by ID only Not implemented');
  try {
    const shelf = await Shelf.findOne({ shelf_id: req.params.shelf_id });
    if (!shelf) return res.status(404).send({ error: 'Shelf not found' });
    res.send(shelf);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Update shelf by shelf_id and store_number
app.put('/shelf/:shelf_id/store/:store_number', async (req, res) => {
  try {
    const { shelf_id, store_number } = req.params;
    console.log(req.params.shelf_id, req.params.store_number);
    // Ensure both shelf_id and store_number are provided
    if (!store_number) {
      return res.status(400).send({ error: 'store_number is required'});
    }
    // is not a number
    if (isNaN(store_number)) {
      return res.status(400).send({ error: 'store_number must be a number' });
    }
    console.log(req.body);
    const shelf = await Shelf.findOneAndUpdate(
      { shelf_id, store_number: store_number }, // Match both shelf_id and store_number
      req.body,
      { new: true }
    );

    if (!shelf) return res.status(404).send({ error: 'Shelf not found', shelf_id, store_number});
    res.send(shelf);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Delete shelf by shelf_id and store_number
app.delete('/shelf/:shelf_id/store/:store_number', async (req, res) => {
    try {
        console.log('Delete request received for shelf_id:', req.params.shelf_id, 'store_number:', req.params.store_number);

        if (!req.params.store_number) {
            return res.status(400).send({ error: 'store_number is required' });
        }
        const shelf = await Shelf.findOneAndDelete({
            shelf_id: req.params.shelf_id,
            store_number: Number(req.params.store_number),
        });
        if (!shelf) {
            console.log('Shelf not found:', req.params.shelf_id, req.params.store_number);
            return res.status(404).send({
                error: 'Shelf not found',
                shelf_id: req.params.shelf_id,
                store_number: req.params.store_number,
            });
        }
        res.send(shelf);
    } catch (err) {
        console.error('Error deleting shelf:', err.message);
        res.status(500).send({ error: err.message });
    }
});

// Get all shelves by store number
app.get('/shelves', async (req, res) => {
  try {
    req.query.store = Number(req.query.store);
    console.log('Query for shelves of store number:', req.query.store);
    const shelves = await Shelf.find({ store: req.query.store_number });
    res.send(shelves);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});


// -------------------- Modular Routes --------------------

// Create a new modular
app.post('/modular', async (req, res) => {
  try {
    const modular = new Modular(req.body);
    await modular.save();
    res.status(201).send(modular);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Get modular by modular_id
app.get('/modular/:modular_id', async (req, res) => {
  try {
    const modular = await Modular.findOne({ modular_id: req.params.modular_id });
    if (!modular) return res.status(404).send({ error: 'Modular not found' });
    res.send(modular);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Update modular by modular_id
app.put('/modular/:modular_id', async (req, res) => {
  try {
    const modular = await Modular.findOneAndUpdate({ modular_id: req.params.modular_id }, req.body, { new: true });
    if (!modular) return res.status(404).send({ error: 'Modular not found' });
    res.send({ status: 'ok', modular });
  } catch (err) {
    res.status(500).send(err);
  }
});
// Delete modular by modular_id
app.delete('/modular/:modular_id', async (req, res) => {
  try {
    const modular = await Modular.findOneAndDelete({ modular_id: req.params.modular_id });
    if (!modular) return res.status(404).send({ error: 'Modular not found' });
    res.send({ status: 'ok', modular });
  } catch (err) {
    res.status(500).send(err);
  }
});

// -------------------- Item Routes --------------------


// Create item by item number
app.post('/item', async (req, res) => {
  try {
    const item = new Item(req.body);
    await item.save();
    res.status(201).send(item);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Get item by number
app.get('/item/:item_number', async (req, res) => {
  try {
    const item = await Item.findOne({ item_number: req.params.item_number });
    if (!item) return res.status(404).send({ error: 'Item not found' });
    res.send(item);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Update item by number
app.put('/item/:item_number', async (req, res) => {
  try {
    const item = await Item.findOneAndUpdate({ item_number: req.params.item_number }, req.body, { new: true });
    if (!item) return res.status(404).send({ error: 'Item not found' });
    res.send(item);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Delete item by number
app.delete('/item/:item_number', async (req, res) => {
  try {
    const item = await Item.findOneAndDelete({ item_number: req.params.item_number });
    if (!item) return res.status(404).send({ error: 'Item not found' });
    res.send(item);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});



// -------------------- Item Index Routes --------------------


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
    const itemIndexes = await ItemIndex.find({ upcs: req.params.upc, store: req.params.storeId });
    res.send(itemIndexes);
  } catch (err) {
    res.status(500).send(err);
  }
});

// update item index individually 
app.put('/itemindex', async (req, res) => {
  try {
    const { store, upcs } = req.body;
    // Use the first UPC as the unique key, or adapt for the schema
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

// Update item index by upc and store number
app.put('/itemindex/upc/:upc/store/:store_number', async (req, res) => {
  try {
    const itemIndex = await ItemIndex.findOneAndUpdate({ upc: req.params.upc, store_number: req.params.store_number }, req.body, { new: true });
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

// -------------------- Pickwalk Routes --------------------

// create a new pickwalk
app.post('/pickwalk', async (req, res) => {
  try {
    const pickwalk = new Pickwalk(req.body);
    await pickwalk.save();
    res.send({ status: 'ok', pickwalk });
  } catch (err) {
    res.status(500).send(err);
  }
});

//Get a pickwalk by pickwalk_id and store_id
app.get('/pickwalk/:pickwalk_id/store/:store_id', async (req, res) => {
  try {
    const pickwalk = await Pickwalk.findById(req.params.pickwalk_id);
    if (!pickwalk) return res.status(404).send({ error: 'Pickwalk not found' });
    if (pickwalk.store_id !== req.params.store_id) {
      return res.status(403).send({ error: 'No store ID for pickwalk' });
    }
    res.send(pickwalk);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Update pickwalk by pickwalk_id and store_id
app.put('/pickwalk/:pickwalk_id/store/:store_id', async (req, res) => {
  try {
    const pickwalk = await Pickwalk.findById(req.params.pickwalk_id);
    if (!pickwalk) return res.status(404).send({ error: 'Pickwalk not found' });
    if (pickwalk.store_id !== req.params.store_id) {
      return res.status(403).send({ error: 'No store ID for pickwalk' });
    }
    Object.assign(pickwalk, req.body);
    await pickwalk.save();
    res.send({ status: 'ok', pickwalk });
  } catch (err) {
    res.status(500).send(err);
  }
});

// delete pickwalk by pickwalk_id and store_id
app.delete('/pickwalk/:pickwalk_id/store/:store_id', async (req, res) => {
  try {
    const pickwalk = await Pickwalk.findById(req.params.pickwalk_id);
    if (!pickwalk) return res.status(404).send({ error: 'Pickwalk not found' });
    if (pickwalk.store_id !== req.params.store_id) {
      return res.status(403).send({ error: 'No store ID for pickwalk' });
    }
    await pickwalk.remove();
    res.send({ status: 'ok' });
  } catch (err) {
    res.status(500).send(err);
  }
});

// get all pickwalks by store_id
app.get('/pickwalks/store/:store_id', async (req, res) => {
  try {
    const pickwalks = await Pickwalk.find({ store_id: req.params.store_id });
    res.send(pickwalks);
  } catch (err) {
    res.status(500).send(err);
  }
});
// -------------------- End of Store Routes --------------------

// -------------------- WebSocket Connection --------------------

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Listen for shelf updates
  socket.on('updateShelf', (data) => {
    console.log('Shelf updated:', data);

    // Broadcast the update to all other clients, including the sender's socket ID
    socket.broadcast.emit('updateShelf', { ...data, senderId: socket.id });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 42069;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


// -------------------- GTSP Routes --------------------

// Endpoint to check GTSP server status
app.get('/gtsp-status', async (req, res) => {
  try {
    const response = await axios.get('http://gtsp-server:5000/ping');
    res.send({ status: 'up', data: response.data });
  } catch (err) {
    res.status(503).send({ status: 'down', error: err.message });
  }
});

// endpoint to request a pickwalk from GTSP server
// using store number and list of upcs
app.post('/request-pickwalk', async (req, res) => {
  try {
    const { store_number, upcs } = req.body;
    if (!store_number || !upcs || !Array.isArray(upcs)) {
      return res.status(400).send({ error: 'store_number and upcs array are required' });
    }
    const response = await axios.post('http://gtsp-server:5000/compute-pickwalk', {
      store_number,
      upcs
    });
    res.send({ status: 'ok', pickwalk: response.data });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// -------------------- End of GTSP Routes --------------------

// For graceful shutdown
process.on('SIGINT', () => {
  mongoose.connection.close(() => {
    console.log('MongoDB connection closed');
    process.exit(0);
  });
});
