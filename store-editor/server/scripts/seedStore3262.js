import mongoose from 'mongoose';
import { seedStore3262 } from '../services/seedStore3262.js';

const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017/storemaps';

mongoose
  .connect(mongoUrl)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

seedStore3262()
  .then(() => {
    console.log('Store 3262 seed complete');
    return mongoose.connection.close();
  })
  .catch((err) => {
    console.error('Store 3262 seed failed:', err);
    process.exit(1);
  });
