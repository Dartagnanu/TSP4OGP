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
import authRouter from './routes/auth.js';
import { requireAuth, requireSessionStore, setupSocketAuth } from './middleware/auth.js';
import { recordAccess } from './services/accessHistory.js';
import { ensureDefaultManagers } from './services/ensureManagers.js';
import { syncManagerStoreAccess } from './services/syncManagerStoreAccess.js';
import { debugLog } from './lib/debugLog.js';

// Resolve __dirname in ES Modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Shelves may store modulars as modular_id strings ("202") or Mongo ObjectIds from seed. */
async function resolveModularRef(ref) {
  if (ref == null || ref === '') return null;
  if (typeof ref === 'object') {
    if (ref.modular_id != null) ref = ref.modular_id;
    else if (ref._id != null) ref = ref._id;
  }
  const asString = String(ref);
  let modular = await Modular.findOne({ modular_id: asString });
  if (modular) return modular;
  if (mongoose.Types.ObjectId.isValid(asString)) {
    modular = await Modular.findById(asString);
    if (modular) return modular;
  }
  return null;
}

function modularRefsFromPayload(payload, sourceShelf) {
  const fromPayload = payload?.modulars;
  if (Array.isArray(fromPayload) && fromPayload.length > 0) {
    return fromPayload;
  }
  return sourceShelf?.modulars || [];
}

/** Resolve shelf modular refs to modular_id strings for API clients (seed may store ObjectIds). */
async function modularIdsForClient(refs) {
  const out = [];
  for (const ref of refs || []) {
    const modular = await resolveModularRef(ref);
    out.push(modular ? modular.modular_id : String(ref));
  }
  return out;
}

async function shelfToClientJson(shelf) {
  const obj = shelf.toObject ? shelf.toObject() : { ...shelf };
  obj.modulars = await modularIdsForClient(shelf.modulars);
  return obj;
}

/** Rebuild itemindex locations for one shelf from its modulars (pathfinder reads itemindexes, not shelf.modulars). */
async function syncItemIndexForShelf(shelf, storeNumber) {
  const shelfId = shelf._id;
  const modularRefs = (shelf.modulars || []).filter(Boolean);

  await ItemIndex.updateMany(
    { store_number: storeNumber },
    { $pull: { locations: { shelf_name: shelfId } } }
  );

  let indexesUpdated = 0;
  const modularsResolved = [];
  const modularsMissing = [];

  for (const modularRef of modularRefs) {
    const modular = await resolveModularRef(modularRef);
    if (!modular) {
      modularsMissing.push(String(modularRef));
      continue;
    }
    modularsResolved.push(modular.modular_id);

    for (const modItem of modular.items || []) {
      // Do not remove other shelves' locations here — pathfinder picks the nearest
      // candidate among all itemindex entries. Clearing modulars on a shelf and syncing
      // removes that shelf's rows via the $pull at the start of this function.

      const docs = await ItemIndex.find({
        store_number: storeNumber,
        item_number: modItem.item_number,
      });
      for (const doc of docs) {
        const exists = doc.locations.some(
          (loc) => loc.shelf_name.equals(shelfId) && loc.location === modItem.location
        );
        if (!exists) {
          doc.locations.push({ shelf_name: shelfId, location: modItem.location });
          await doc.save();
          indexesUpdated += 1;
        }
      }
    }
  }

  return { indexesUpdated, modularsResolved, modularsMissing };
}

const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017/storemaps';

mongoose.connection.on('connected', () => {
  console.log(`Mongoose connected to ${mongoUrl}`);
});
mongoose.connection.on('error', (err) => {
  console.log('Mongoose connection error:', err);
});
mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected');
});

const app = express();
const server = http.createServer(app);
const io = new SocketIo(server);
setupSocketAuth(io);

app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// Serve the index.html file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

app.use('/auth', authRouter);

app.get('/gtsp-status', async (req, res) => {
  try {
    const response = await axios.get('http://gtsp-server:5000/ping');
    res.send({ status: 'up', data: response.data });
  } catch (err) {
    res.status(503).send({ status: 'down', error: err.message });
  }
});

const api = express.Router();
api.use(requireAuth);
api.use(requireSessionStore);

// -------------------- Store Routes --------------------

// Create a new store
api.post('/store', async (req, res) => {
  try {
    const store = new Store(req.body);
    await store.save();
    res.status(201).send(store);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Get store by store number
api.get('/store/:number', async (req, res) => {
  try {
    const store = await Store.findOne({ store_number: Number(req.params.number) });
    if (!store) return res.status(404).send({ error: 'Store not found' });
    res.send(store);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Update store by store number
api.put('/store/:number', async (req, res) => {
  try {
    const store = await Store.findOneAndUpdate(
      { store_number: Number(req.params.number) },
      req.body,
      { new: true }
    );
    if (!store) return res.status(404).send({ error: 'Store not found' });
    await recordAccess({
      username: req.auth.username,
      store_number: req.auth.store_number,
      action: 'store_update',
      summary: `Updated store ${req.params.number} layout`,
      metadata: { store_number: Number(req.params.number) },
    });
    res.send(store);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Delete store by store number
api.delete('/store/:number', async (req, res) => {
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
api.post('/shelf', async (req, res) => {
  try {
    const shelf = new Shelf(req.body);
    await shelf.save();
    const storeNum = Number(shelf.store_number);
    const syncResult = await syncItemIndexForShelf(shelf, storeNum);
    await recordAccess({
      username: req.auth.username,
      store_number: req.auth.store_number,
      action: 'shelf_create',
      summary: `Created shelf ${shelf.shelf_name}`,
      metadata: { shelf_name: shelf.shelf_name },
    });
    res.status(201).send({
      ...(await shelfToClientJson(shelf)),
      itemIndexesSynced: syncResult,
    });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Clone shelf and duplicate itemindex locations from source shelf
api.post('/shelf/:source_shelf_name/clone', async (req, res) => {
  try {
    const sourceName = req.params.source_shelf_name;
    const store_number = Number(req.body.store_number);
    if (!store_number || Number.isNaN(store_number)) {
      return res.status(400).send({ error: 'store_number is required' });
    }

    const sourceShelf = await Shelf.findOne({ shelf_name: sourceName, store_number });
    if (!sourceShelf) {
      return res.status(404).send({ error: 'Source shelf not found', shelf_name: sourceName });
    }

    const payload = req.body;
    const newShelf = new Shelf({
      store_number,
      shelf_name: payload.shelf_name,
      template: payload.template ?? sourceShelf.template,
      placement_x: payload.placement_x ?? sourceShelf.placement_x + 1,
      placement_y: payload.placement_y ?? sourceShelf.placement_y + 1,
      rotation: payload.rotation ?? sourceShelf.rotation,
      modulars: modularRefsFromPayload(payload, sourceShelf),
      flex_items: payload.flex_items ?? sourceShelf.flex_items,
      department: payload.department ?? sourceShelf.department,
    });
    await newShelf.save();

    const sourceId = sourceShelf._id;
    const newId = newShelf._id;
    const indexes = await ItemIndex.find({
      store_number,
      'locations.shelf_name': sourceId,
    });

    let itemIndexesUpdated = 0;
    for (const doc of indexes) {
      const additions = [];
      for (const loc of doc.locations) {
        if (loc.shelf_name.equals(sourceId)) {
          additions.push({ shelf_name: newId, location: loc.location });
        }
      }
      if (additions.length > 0) {
        doc.locations.push(...additions);
        await doc.save();
        itemIndexesUpdated += 1;
      }
    }

    const syncResult = await syncItemIndexForShelf(newShelf, store_number);

    await recordAccess({
      username: req.auth.username,
      store_number: req.auth.store_number,
      action: 'shelf_clone',
      summary: `Cloned shelf ${sourceName} to ${newShelf.shelf_name}`,
      metadata: { source: sourceName, shelf_name: newShelf.shelf_name },
    });

    res.status(201).send({
      shelf: await shelfToClientJson(newShelf),
      itemIndexesUpdated,
      itemIndexesSynced: syncResult,
    });
  } catch (err) {
    console.error('Error cloning shelf:', err);
    res.status(500).send({ error: err.message });
  }
});

// Get shelf by ID
api.get('/shelf/:shelf_name', async (req, res) => {
  // TODO: fix search shelf by ID only
  throw new Error('search shelf by ID only Not implemented');
  try {
    const shelf = await Shelf.findOne({ shelf_name: req.params.shelf_name });
    if (!shelf) return res.status(404).send({ error: 'Shelf not found' });
    res.send(shelf);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Update shelf by shelf_name and store_number 
api.put('/shelf/:shelf_name/store/:store_number', async (req, res) => {
  try {
    const { shelf_name, store_number } = req.params;
    console.log(req.params.shelf_name, req.params.store_number);
    // Ensure both shelf_name and store_number are provided
    if (!store_number) {
      return res.status(400).send({ error: 'store_number is required'});
    }
    // is not a number
    if (isNaN(store_number)) {
      return res.status(400).send({ error: 'store_number must be a number' });
    }
    console.log(req.body);
    const shelf = await Shelf.findOneAndUpdate(
      { shelf_name, store_number: Number(store_number) },
      req.body,
      { new: true }
    );

    if (!shelf) return res.status(404).send({ error: 'Shelf not found', shelf_name, store_number});
    const storeNum = Number(store_number);
    const syncResult = await syncItemIndexForShelf(shelf, storeNum);
    await recordAccess({
      username: req.auth.username,
      store_number: req.auth.store_number,
      action: 'shelf_update',
      summary: `Updated shelf ${shelf_name}`,
      metadata: { shelf_name },
    });
    res.send({ ...(await shelfToClientJson(shelf)), itemIndexesSynced: syncResult });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Delete shelf by shelf_name and store_number
api.delete('/shelf/:shelf_name/store/:store_number', async (req, res) => {
    try {
        console.log('Delete request received for shelf_name:', req.params.shelf_name, 'store_number:', req.params.store_number);

        if (!req.params.store_number) {
            return res.status(400).send({ error: 'store_number is required' });
        }
        const shelf = await Shelf.findOneAndDelete({
            shelf_name: req.params.shelf_name,
            store_number: Number(req.params.store_number),
        });
        if (!shelf) {
            console.log('Shelf not found:', req.params.shelf_name, req.params.store_number);
            return res.status(404).send({
                error: 'Shelf not found',
                shelf_name: req.params.shelf_name,
                store_number: req.params.store_number,
            });
        }
        await ItemIndex.updateMany(
            { store_number: Number(req.params.store_number) },
            { $pull: { locations: { shelf_name: shelf._id } } }
        );
        await recordAccess({
          username: req.auth.username,
          store_number: req.auth.store_number,
          action: 'shelf_delete',
          summary: `Deleted shelf ${req.params.shelf_name}`,
          metadata: { shelf_name: req.params.shelf_name },
        });
        res.send(shelf);
    } catch (err) {
        console.error('Error deleting shelf:', err.message);
        res.status(500).send({ error: err.message });
    }
});

// Get all shelves by store number
api.get('/shelves', async (req, res) => {
  try {
    const store_number = Number(req.query.store);
    console.log('Query for shelves of store number:', store_number);
    const shelves = await Shelf.find({ store_number: store_number });
    const out = [];
    for (const shelf of shelves) {
      out.push(await shelfToClientJson(shelf));
    }
    res.send(out);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});


// -------------------- Modular Routes --------------------

// Create a new modular
api.post('/modular', async (req, res) => {
  try {
    const modular = new Modular(req.body);
    await modular.save();
    res.status(201).send(modular);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Get modular by modular_id
api.get('/modular/:modular_id', async (req, res) => {
  try {
    const modular = await Modular.findOne({ modular_id: req.params.modular_id });
    if (!modular) return res.status(404).send({ error: 'Modular not found' });
    res.send(modular);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Update modular by modular_id
api.put('/modular/:modular_id', async (req, res) => {
  try {
    const modular = await Modular.findOneAndUpdate({ modular_id: req.params.modular_id }, req.body, { new: true });
    if (!modular) return res.status(404).send({ error: 'Modular not found' });
    res.send({ status: 'ok', modular });
  } catch (err) {
    res.status(500).send(err);
  }
});
// Delete modular by modular_id
api.delete('/modular/:modular_id', async (req, res) => {
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
api.post('/item', async (req, res) => {
  try {
    const item = new Item(req.body);
    await item.save();
    res.status(201).send(item);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Get item by number
api.get('/item/:item_number', async (req, res) => {
  try {
    const item = await Item.findOne({ item_number: req.params.item_number });
    if (!item) return res.status(404).send({ error: 'Item not found' });
    res.send(item);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Update item by number
api.put('/item/:item_number', async (req, res) => {
  try {
    const item = await Item.findOneAndUpdate({ item_number: req.params.item_number }, req.body, { new: true });
    if (!item) return res.status(404).send({ error: 'Item not found' });
    res.send(item);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Delete item by number
api.delete('/item/:item_number', async (req, res) => {
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
api.post('/itemindex', async (req, res) => {
  try {
    const itemIndex = new ItemIndex(req.body);
    await itemIndex.save();
    res.send({ status: 'ok', itemIndex });
  } catch (err) {
    res.status(500).send(err);
  }
});

// Get itemIndex by upc and store ID
api.get('/itemindex/upc/:upc/store/:storeId', async (req, res) => {
  try {
    const itemIndexes = await ItemIndex.find({ upcs: req.params.upc, store: req.params.storeId });
    res.send(itemIndexes);
  } catch (err) {
    res.status(500).send(err);
  }
});

// update item index individually 
api.put('/itemindex', async (req, res) => {
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
api.put('/itemindex/upc/:upc/store/:store_number', async (req, res) => {
  try {
    const itemIndex = await ItemIndex.findOneAndUpdate({ upc: req.params.upc, store_number: req.params.store_number }, req.body, { new: true });
    if (!itemIndex) return res.status(404).send({ error: 'ItemIndex not found' });
    res.send({ status: 'ok', itemIndex });
  } catch (err) {
    res.status(500).send(err);
  }
});

// Delete item index by upc and store ID
api.delete('/itemindex/upc/:upc', async (req, res) => {
  try {
    const itemIndex = await ItemIndex.findOneAndDelete({ upc: req.params.upc, store: req.body.store });
    if (!itemIndex) return res.status(404).send({ error: 'ItemIndex not found' });
    res.send({ status: 'ok', itemIndex });
  } catch (err) {
    res.status(500).send(err);
  }
});

// generate item index for a store
api.post('/generate-itemindex/:storeId', async (req, res) => {
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
api.post('/pickwalk', async (req, res) => {
  try {
    const pickwalk = new Pickwalk(req.body);
    await pickwalk.save();
    res.send({ status: 'ok', pickwalk });
  } catch (err) {
    res.status(500).send(err);
  }
});

//Get a pickwalk by pickwalk_id and store_id
api.get('/pickwalk/:pickwalk_id/store/:store_id', async (req, res) => {
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
api.put('/pickwalk/:pickwalk_id/store/:store_id', async (req, res) => {
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
api.delete('/pickwalk/:pickwalk_id/store/:store_id', async (req, res) => {
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
api.get('/pickwalks/store/:store_id', async (req, res) => {
  try {
    const pickwalks = await Pickwalk.find({ store_id: req.params.store_id });
    res.send(pickwalks);
  } catch (err) {
    res.status(500).send(err);
  }
});

api.post('/request-pickwalk', async (req, res) => {
  try {
    const { store_number, upcs } = req.body;
    if (!store_number || !upcs || !Array.isArray(upcs)) {
      return res.status(400).send({ error: 'store_number and upcs array are required' });
    }
    const response = await axios.post('http://gtsp-server:5000/compute-pickwalk', {
      store_number,
      upcs,
    });
    await recordAccess({
      username: req.auth.username,
      store_number: req.auth.store_number,
      action: 'pickwalk_request',
      summary: `Requested pickwalk with ${upcs.length} UPCs`,
      metadata: { upc_count: upcs.length },
    });
    res.send({ status: 'ok', pickwalk: response.data });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.use(api);

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

async function start() {
  try {
    await mongoose.connect(mongoUrl);
    console.log('Connected to MongoDB');
    debugLog('index.js:start', 'mongo connected', {}, 'B');
    const mgr = await ensureDefaultManagers();
    await syncManagerStoreAccess();
    debugLog('index.js:start', 'managers ensured', { created: mgr?.created }, 'A');
    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      debugLog('index.js:start', 'server listening', { port: PORT }, 'B');
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    debugLog('index.js:start', 'start failed', { err: err.message, code: err.code }, 'C');
    process.exit(1);
  }
}

start();

// For graceful shutdown
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
    process.exit(0);
  } catch (err) {
    console.error('Error closing MongoDB connection:', err);
    process.exit(1);
  }
});
