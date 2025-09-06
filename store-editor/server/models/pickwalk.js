import mongoose from 'mongoose';

const pickwalkItemSchema = new mongoose.Schema({
    upc: { type: String, required: true },
    quantity: { type: Number, required: true },
    shelf: {
        shelf_id: { type: String, required: false, default: null },
        location: { type: String, required: false, default: null },
        placement_x: { type: Number, required: false, default: null },
        placement_y: { type: Number, required: false, default: null }
    },
    ordered_number: { type: Number, required: false, default: null }

});

const pointSchema = new mongoose.Schema({
    id: { type: String, required: true },
    point: { type: [Number], required: true, validate: v => v.length === 2 }
}, { _id: false });

// pickwalk schema for pickwalks
const pickwalkListSchema = new mongoose.Schema({
    pickwalk_id: { type: String, required: true },
    store_id: { type: Number, required: true },
    pickwalk_subtype: { type: String, required: true },
    starting_point: { type: [pointSchema], default: [0, 0] },
    itemList: [
        pickwalkItemSchema
    ],
    dueDate: { type: Date, required: true, default: Date.now },
    dueTime: { type: String, required: true },
});

export default mongoose.model('PickwalkList', pickwalkListSchema);