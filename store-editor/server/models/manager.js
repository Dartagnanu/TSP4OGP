import mongoose from 'mongoose';

const managerSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password_hash: { type: String, required: true },
  allowed_store_numbers: { type: [Number], required: true, default: [] },
  display_name: { type: String, default: '' },
  active: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model('Manager', managerSchema);
