import mongoose from 'mongoose';
import Store from './store.js';
import Shelf from './shelf.js';
import Item from './item.js';
import Modular from './modular.js';
import ItemIndex from './itemIndex.js';
import Pickwalk from './pickwalk.js';
import Manager from './manager.js';
import bcrypt from 'bcrypt';
import { seedStore3260 } from '../services/seedStore3260.js';
import { seedStore3261 } from '../services/seedStore3261.js';
import { seedStore3262 } from '../services/seedStore3262.js';

console.log('Seed script started');

const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017/storemaps';
mongoose.connect(mongoUrl)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

async function populateTestDataFromSeed() {
  try {
    await Store.deleteMany({});
    await Shelf.deleteMany({});
    await Modular.deleteMany({});
    await Item.deleteMany({});
    await ItemIndex.deleteMany({});
    await Pickwalk.deleteMany({});
    console.log('Cleared existing data from the database.');

    await seedStore3260();
    await seedStore3261();
    await seedStore3262();
    await populateManagers([3260, 3261, 3262]);
    return true;
  } catch (error) {
    console.error('Error populating test data:', error);
    return null;
  } finally {
    mongoose.connection.close();
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

populateTestDataFromSeed().then(() => console.log('Seeding complete'));
