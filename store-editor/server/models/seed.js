import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import Store from './store.js';
import Shelf from './shelf.js';
import Item from './item.js';
import Modular from './modular.js';
import ItemIndex from './itemIndex.js';
import Pickwalk from './pickwalk.js';
import Manager from './manager.js';
import bcrypt from 'bcrypt';
import { seedStore3261 } from '../services/seedStore3261.js';

console.log('Seed script started');

// Resolve __dirname in ES Modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Connect to MongoDB
const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017/storemaps';
mongoose.connect(mongoUrl)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1); // Exit the process if the connection fails
  });

async function populateTestDataFromSeed() {
  try {
    const seedPath = path.join(__dirname, '../data/dataseed.json');
    const raw = await fs.readFile(seedPath, 'utf8');
    const data = JSON.parse(raw);

    // Validate seed data
    if (!data.store_number || !data.shelves || !data.modulars || !data.items) {
      throw new Error('dataseed.json is missing required fields.');
    }

    // Clear existing data
    await Store.deleteMany({});
    await Shelf.deleteMany({});
    await Modular.deleteMany({});
    await Item.deleteMany({});
    await ItemIndex.deleteMany({});
    console.log('Cleared existing data from the database.');

    // Create Store
    const store = await Store.findOneAndUpdate(
      { store_number: data.store_number },
      {
        name: data.name,
        location: data.location,
        map_size: data.map_size,
        store_shape: data.store_shape,
        walls: data.walls,
        shelf_templates: data.shelf_templates,
        starting_points: data.starting_points,
        registers: data.registers,
      },
      { upsert: true, new: true }
    );

    // Create Modulars
    const modularIdMap = {};
    for (const modular of data.modulars) {
      const modDoc = await Modular.findOneAndUpdate(
        { modular_id: modular.modular_id },
        { ...modular, store: store._id },
        { upsert: true, new: true }
      );
      modularIdMap[modular.modular_id] = modDoc._id;
    }

    // Create Shelves
    const shelfIdMap = {};
    for (const shelf of data.shelves) {
      const modulars = (shelf.modulars || []).map((id) => modularIdMap[id]);
  
      const shelfDoc = await Shelf.findOneAndUpdate(
        { shelf_name: shelf.shelf_name, store_number: shelf.store_number },
        {
          ...shelf,
          store: store._id,
          modulars,
        },
        { upsert: true, new: true }
      );
      shelfIdMap[shelf.shelf_name] = shelfDoc._id;
    }

    // Create Items
    console.log('Seeding items...');
    for (const item of data.items) {
      try {
        const itemDoc = await Item.findOneAndUpdate(
          { item_number: item.item_number },
          { ...item },
          { upsert: true, new: true }
        );
        console.log(`Saved item: ${itemDoc.item_number}`);
      } catch (err) {
        console.error(`Error saving item ${item.item_number}:`, err);
      }
    }

    // Create Item Indexes
    console.log('Seeding item indexes...');
    const itemLocationMap = {};
    for (const modular of data.modulars) {
      for (const modItem of modular.items) {
        for (const shelf of data.shelves) {
          if ((shelf.modulars || []).includes(modular.modular_id)) {
            if (!itemLocationMap[modItem.item_number]) itemLocationMap[modItem.item_number] = [];
            itemLocationMap[modItem.item_number].push({
              shelf_name: shelfIdMap[shelf.shelf_name],
              location: modItem.location,
            });
          }
        }
      }
    }
    console.log('Item Location Map:', itemLocationMap);

    for (const item of data.items) {
      const upcs = Array.isArray(item.upcs) ? item.upcs : [item.upc];
      for (const upc of upcs) {
        try {
          const itemIndex = await ItemIndex.findOneAndUpdate(
            { store: store.store_number.toString(), upcs: upc },
            {
              store: store.store_number.toString(), // Save store_number as a string
              store_number: store.store_number,
              item_number: item.item_number,
              upcs: [upc],
              locations: itemLocationMap[item.item_number] || [],
              price: item.price,
              photo: item.photo,
              name: item.name,
              pickwalk: item.pickwalk,
            },
            { upsert: true, new: true }
          );
          console.log(itemIndex);
          console.log(`Saved item index for UPC: ${upc}`);
        } catch (err) {
          console.error(`Error saving item index for UPC ${upc}:`, err);
        }
      }
    }

    console.log('Test data populated from dataseed.json!');
    await seedStore3261();
    await populateManagers([data.store_number, 3261]);
    return data;
  } catch (error) {
    console.error('Error populating test data:', error);
    return null;
  } finally {
    mongoose.connection.close();
  }
}


async function populatePickwalks() {
  try {
    const pickwalkSeedPath = path.join(__dirname, '../data/pickwalksseed.json');
    const raw = await fs.readFile(pickwalkSeedPath, 'utf8');
    const data = JSON.parse(raw);

    // Validate pickwalk data
    if (!data.pickwalks || !Array.isArray(data.pickwalks)) {
      throw new Error('pickwalksseed.json is missing required fields or is not an array.');
    }

    // Clear existing pickwalks
    await Pickwalk.deleteMany({});
    console.log('Cleared existing pickwalks from the database.');

    // Insert pickwalks
    for (const pickwalk of data.pickwalks) {
      try {
        const pickwalkDoc = await Pickwalk.findOneAndUpdate(
          { pickwalk_id: pickwalk.pickwalk_id, store_id: pickwalk.store_id },
          pickwalk,
          { upsert: true, new: true }
        );
        console.log(`Saved pickwalk: ${pickwalkDoc.pickwalk_id}`);
      } catch (err) {
        console.error(`Error saving pickwalk ${pickwalk.pickwalk_id}:`, err);
      }
    }

    console.log('Pickwalk data populated from pickwalksseed.json!');
  } catch (error) {
    console.error('Error populating pickwalk data:', error);
  } 
}

async function populateManagers(storeNumbers) {
  const stores = [...new Set(storeNumbers.filter((n) => Number.isFinite(n)))];
  if (stores.length === 0) stores.push(3260);

  const managerHash = await bcrypt.hash('manager', 10);
  await Manager.findOneAndUpdate(
    { username: 'manager' },
    {
      username: 'manager',
      password_hash: managerHash,
      allowed_store_numbers: stores,
      display_name: 'Store Manager',
      active: true,
    },
    { upsert: true, new: true }
  );

  const manager1Hash = await bcrypt.hash('manager1', 10);
  await Manager.findOneAndUpdate(
    { username: 'manager1' },
    {
      username: 'manager1',
      password_hash: manager1Hash,
      allowed_store_numbers: stores,
      display_name: 'Regional Manager',
      active: true,
    },
    { upsert: true, new: true }
  );

  console.log('Manager accounts seeded (manager/manager, manager1/manager1) for stores:', stores);
}

populatePickwalks().then(() => console.log('Pickwalk seeding complete'));
populateTestDataFromSeed().then(() => console.log('Seeding complete'));
