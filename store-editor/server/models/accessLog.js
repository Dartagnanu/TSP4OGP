import mongoose from 'mongoose';

const ACCESS_ACTIONS = [
  'login',
  'logout',
  'shelf_create',
  'shelf_update',
  'shelf_delete',
  'shelf_clone',
  'store_update',
  'pickwalk_request',
];

const accessLogSchema = new mongoose.Schema({
  username: { type: String, required: true, index: true },
  store_number: { type: Number, required: true, index: true },
  action: { type: String, required: true, enum: ACCESS_ACTIONS },
  summary: { type: String, required: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

accessLogSchema.index({ username: 1, created_at: -1 });
accessLogSchema.index({ store_number: 1, created_at: -1 });

export { ACCESS_ACTIONS };
export default mongoose.model('AccessLog', accessLogSchema);
