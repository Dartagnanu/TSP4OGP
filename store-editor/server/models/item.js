import mongoose from 'mongoose';

// item schema used as template for itemIndex, only changes when home office makes updates
const itemSchema = new mongoose.Schema({
    item_number: { type: Number, required: true },
    name: { type: String, required: true},
    upcs: { type: [String], required: true, index: true}, // a set for multiple cross referenced upcs
    photo: { type: String, required: true}, // this will be a url reference to the photo
    price: { type: Number, required: true}, 
    department: { type: String, required: true},
    pickwalk: { type: String, required: true},
});
export default mongoose.model('Item', itemSchema);
