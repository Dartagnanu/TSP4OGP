import mongoose from 'mongoose';

const managerAccessEntrySchema = new mongoose.Schema({
  username: { type: String, required: true },
  last_access_at: { type: Date, required: true },
  last_action: { type: String, required: true },
}, { _id: false });

const storeAccessSummarySchema = new mongoose.Schema({
  store_number: { type: Number, required: true, unique: true, index: true },
  managers: { type: [managerAccessEntrySchema], default: [] },
}, { timestamps: true });

export default mongoose.model('StoreAccessSummary', storeAccessSummarySchema);
