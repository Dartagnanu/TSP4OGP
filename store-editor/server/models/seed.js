console.log('Seed script started');
const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/storemaps', { useNewUrlParser: true, useUnifiedTopology: true });
const fs = require('fs').promises;
const path = require('path');
const Store = require('./store').default;
const Shelf = require('./shelf').default;
const Item = require('./item').default;
const Modular = require('./modular').default;
const ItemIndex = require('./itemIndex').default;

async function populateTestDataFromSeed() {
    try {
        const seedPath = path.join(__dirname, '../data/dataseed.json');
        const raw = await fs.readFile(seedPath, 'utf8');
        const data = JSON.parse(raw);
        // Create Store
        const store = await Store.findOneAndUpdate(
            {id: data.id},
            {
                name: data.name,
                location: data.location,
                map_size: data.map_size,
                store_shape: data.store_shape,
                walls: data.walls,
                shelf_templates: data.shelf_templates,
                starting_points: data.starting_points,
                registers: data.registers
            },
            { upsert: true, new: true }
        );

        // Create Modulars
        const modularIdMap = {};
        for (const modular of data.modulars) {
            const modDoc = await Modular.findOneAndUpdate(
                { modular_id: modular.modular_id},
                { ...modular, store: store._id },
                { upsert: true, new: true }
            );
            modularIdMap[modular.modular_id] = modDoc._id;
        }

        // Create Shelves
        const shelfIdMap = {};
        for (const shelf of data.shelves) {
            const modulars = (shelf.modulars || []).map(id => modularIdMap[id]);
            const shelfDoc = await Shelf.findOneAndUpdate(
                { shelf_id: shelf.shelf_id },
                {
                    ...shelf,
                    store: store._id,
                    modulars
                },
                { upsert: true, new: true }
            );
            shelfIdMap[shelf.shelf_id] = shelfDoc._id;
        }

        // Create Items
        const itemIdMap = {};
        for (const item of data.items) {
            const itemDoc = await Item.findOneAndUpdate(
                { item_number: item.item_number },
                { ...item },
                { upsert: true, new: true }
            );
            itemIdMap[item.item_number] = itemDoc._id;
        }

        // Build a map: item_number -> array of { shelf_id, location }
        const itemLocationMap = {};
        for (const modular of data.modulars) {
          for (const modItem of modular.items) {
            for (const shelf of data.shelves) {
              if ((shelf.modulars || []).includes(modular.modular_id)) {
                if (!itemLocationMap[modItem.item_number]) itemLocationMap[modItem.item_number] = [];
                itemLocationMap[modItem.item_number].push({
                  shelf_id: shelfIdMap[shelf.shelf_id],
                  location: modItem.location
                });
              }
            }
          }
        }

        // Remove existing ItemIndexes for this store (optional, for clean seed)
        await ItemIndex.deleteMany({ store: store._id });

        // For each item, for each UPC
        for (const item of data.items) {
          const upcs = Array.isArray(item.upcs) ? item.upcs : [item.upc];
          for (const upc of upcs) {
            await ItemIndex.findOneAndUpdate(
              { store: store._id, upcs: upc },
              {
                store: store._id,
                item_number: item.item_number,
                upcs: [upc],
                locations: itemLocationMap[item.item_number] || [],
                price: item.price,
                photo: item.photo,
                name: item.name,
                pickwalk: item.pickwalk
              },
              { upsert: true, new: true }
            );
          }
        }

        console.log('Test data populated from dataseed.json!');
    } catch (error) {
        console.error('Error populating test data:', error);
    }
}

module.exports = { populateTestDataFromSeed };

if (require.main === module) {
  populateTestDataFromSeed().then(() => {
    console.log('Seeding complete');
    mongoose.connection.close();
  });
}