import mongoose from 'mongoose';


const shelfSchema = new mongoose.Schema({
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    id: { type: String, required: true },
    template: { type: String, required: true },
    placement: { type: [Number], required: true, validate: v => v.length === 2 },
    rotation: { type: Number, default: 0 },
    flex_items: { type: [Number], default: [], index: true }, // UPCs added to the shelf
    modulars: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Modular' }],
    department: { type: String, default: "Unknown" }
});

// enforce uniqueness per store
shelfSchema.index({ store: 1, id: 1 }, { unique: true });


const Shelf = mongoose.model('Shelf', shelfSchema);

export default Shelf;



/*

async function findShelvesByUPC(storeId, upc) {
  const store = await Store.findOne({ id: storeId }).exec();
  if (!store) throw new Error(`Store ${storeId} not found`);

  const shelves = await Shelf.find({
    store: store._id,
    $or: [
      { flex_items: upc },
      { "modulars.modular_items.upc": upc }
    ]
  }).exec();

  return shelves;
}

// Example usage
findShelvesByUPC('3260', 32504)
  .then(shelves => {
    shelves.forEach(shelf => {
      console.log(`Shelf ${shelf.id}`);
      shelf.modulars.forEach(mod => {
        mod.modular_items.forEach(item => {
          if (item.upc === 32504) {
            console.log(`  Modular ${mod.modular_id}, Section ${mod.modular_section}, Location ${item.location}`);
          }
        });
      });
    });
  })
  .catch(console.error);

*/
