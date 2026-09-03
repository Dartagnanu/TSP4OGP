import mongoose from "mongoose";

const storeGraphSchema = new mongoose.Schema({
    store_number: { type: Number, required: true, unique: true, index: true },
    format: { type: String, default: 'walkability_v2' },
    width: { type: Number },
    height: { type: Number },
    walkable: { type: Buffer },
    shelf_nodes: { type: Array, default: [] },
    shelves_hash: { type: String },
    graph: { type: Object }, // legacy node_link; deprecated
    last_updated: { type: Date, required: true, default: Date.now },
    store_updated_at: { type: Date },
});

const StoreGraph = mongoose.model("StoreGraph", storeGraphSchema);

export default StoreGraph;
