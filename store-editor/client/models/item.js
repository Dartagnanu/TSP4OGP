import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema({
    item_number: { type: Number, required: true },
    upc: { type: Number, required: true, index: true },
    name: { type: String, required: true},
    upcs: { type: [Number], required: true, index: true},
    photo: { type: String, required: true},
    price: { type: Number, required: true},
    department: { type: String, required: true},
});
const Item = mongoose.model('Item', itemSchema);

export default Item;
