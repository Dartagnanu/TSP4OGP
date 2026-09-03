import mongoose from 'mongoose';

// shelf and location schema for item index
const shelfAndLocationSchema = new mongoose.Schema({
    shelf_name: { type: mongoose.Schema.Types.ObjectId, ref: "Shelf", required: true },
    location: { type: Number, default: null }, // position in modular on that shelf
});

// item index schema represents the index for items in a store
// used to quickly lookup items in a store by upc
// generated using the store map, shelf, item, and modular information
const itemIndexSchema = new mongoose.Schema({
    store: { type: String, required: true },
    store_number: { type: Number, required: true },
    upcs: [{ type: String, required: true }],
    item_number: { type: Number, required: true },
    locations: { type: [shelfAndLocationSchema], default: [] }, // array of shelfs with locations attached
    pickwalk: { type: String, required: true },
    name: { type: String, required: true },
    photo: { type: String, required: true }, // url reference
    price: { type: Number, required: true },
});

itemIndexSchema.index({ store: 1, upcs: 1 }, { unique: true }); // fast UPC lookup
itemIndexSchema.index({ store_number: 1, upcs: 1 });
itemIndexSchema.index({ store_number: 1, item_number: 1 });
itemIndexSchema.index({ store_number: 1, 'locations.shelf_name': 1 });

export default mongoose.model('ItemIndex', itemIndexSchema);
