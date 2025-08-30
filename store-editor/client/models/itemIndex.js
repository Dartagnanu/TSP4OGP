const itemIndexSchema = new mongoose.Schema({
    store: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
    upcs: { type: [Number], required: true },
    item_number: {type: Number, required: true},
    shelf_id: { type: mongoose.Schema.Types.ObjectId, ref: "Shelf", required: true },
    modular_id: { type: mongoose.Schema.Types.ObjectId, default: null }, 
    location: { type: Number, default: null }, // position in modular
    pickwalk: { type: String, required: true },
    name: { type: String, required: true },
    photo: { type: String, required: true },
    price: { type: Number, required: true },
});
itemIndexSchema.index({ store: 1, upcs: 1 });
const ItemIndex = mongoose.model('ItemIndex', itemIndexSchema);
export default ItemIndex;
