import mongoose from 'mongoose';

// shelf schema represents a shelf in a store, can be changed by manager
// updates item index when changed
const shelfSchema = new mongoose.Schema({
    store_number: { type: Number, required: true },
    shelf_name: { type: String, required: true },
    template: { type: String, required: true },
    placement_x: { type: Number, required: true, default: 0 },
    placement_y: { type: Number, required: true, default: 0 },
    rotation: { type: Number, default: 0 },
    flex_items: { type: [Number], default: [], index: true }, // UPCs added to the shelf
    modulars: [{ type: String }], // modular ids placed on this shelf
    department: { type: String, default: "Unknown" }
});

// enforce uniqueness per store
shelfSchema.index({ store_number: 1, shelf_name: 1 }, { unique: true });


export default mongoose.model('Shelf', shelfSchema);

