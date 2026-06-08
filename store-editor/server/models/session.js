import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  username: { type: String, required: true, index: true },
  store_number: { type: Number, required: true },
  expires_at: { type: Date, required: true, index: true },
}, { timestamps: true });

export default mongoose.model('Session', sessionSchema);
