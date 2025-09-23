import mongoose from "mongoose";

const storeGraphSchema = new mongoose.Schema({
    store_number: { type: Number, required: true, unique: true, index: true },
    graph: { type: Object, required: true },
    last_updated: { type: Date, required: true, default: Date.now }
});

const StoreGraph = mongoose.model("StoreGraph", storeGraphSchema);

export default StoreGraph;
