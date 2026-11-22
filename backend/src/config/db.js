import mongoose from 'mongoose';

export async function connectDB() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required. Set it in backend/.env.');
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
  } catch (error) {
    throw new Error(
      'Unable to connect to MongoDB. Check MONGO_URI and make sure the local MongoDB service is running.',
      { cause: error },
    );
  }

  console.log('MongoDB connected');
}
