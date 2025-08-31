import mongoose from 'mongoose';

const pointSchema = new mongoose.Schema({
    id: { type: String, required: true },
    point: { type: [Number], required: true, validate: v => v.length === 2 }
}, { _id: false });

const shelfTemplateSchema = new mongoose.Schema({
    shape: { type: [[Number]], required: true }, // array of [x,y] coordinates
    access: { type: String, enum: ['front', 'all_sides'], default: 'front' },
    color: { type: String, default: '#ffffff' }
}, { _id: false });

const storeSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true, index: true }, // store_id
    map_size: {
        width: { type: Number, required: true },
        height: { type: Number, required: true }
    },
    store_shape: { type: [[Number]], required: true }, // [[x,y],...]
    walls: { // used for pathfinding
        type: [[ [Number] ]], // array of line segments like [[[x1,y1],[x2,y2]], ...]
        default: []
    },
    shelf_templates: { type: Map, of: shelfTemplateSchema, default: {} }, // keyed by template name
    starting_points: { type: [pointSchema], default: [] },
    registers: { type: [pointSchema], default: [] }
}, { timestamps: true });

const Store = mongoose.model('Store', storeSchema);

export default Store;
