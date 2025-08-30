import mongoose from 'mongoose';

const modularSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  modular_id: { type: Number, required: true },
  modular_section: { type: Number, required: true },
  location: { type: String, required: true },
  items: { type: [{ location: Number, upc: Number }], required: true, index: true }
}, { timestamps: true });

// compound index for fast UPC lookup in a specific store
modularSchema.index({ store: 1, upc: 1 });

const Modular = mongoose.model('Modular', modularSchema);

export default Modular;
