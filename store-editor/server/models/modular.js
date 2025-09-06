import mongoose from 'mongoose';

// modular schema used as template for itemIndex, only changes when home office makes updates
const modularSchema = new mongoose.Schema({
  modular_id: { type: String, required: true, unique: true }, // id for modular
  modular: {type: Number, required: true}, // which modular template
  modular_section: { type: Number, required: true }, // which section of modular template
  items: { type: [{ location: Number, item_number: Number }], required: true, index: true }
}, { timestamps: true });

export default mongoose.model('Modular', modularSchema);