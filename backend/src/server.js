import 'dotenv/config';
import app from './app.js';
import { connectDB } from './config/db.js';
import { getJwtSecret } from './utils/jwt.js';
import mongoose from 'mongoose';

const port = Number(process.env.PORT) || 5000;

async function startServer() {
  try {
    getJwtSecret();
    await connectDB();
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

    const server = app.listen(port, () => {
      console.log(`Faculty Affairs API listening on port ${port}`);
    });

    server.on('error', (error) => {
      console.error('Server failed:', error.message);
      process.exit(1);
    });
    let closing = false;
    const shutdown = () => {
      if (closing) return;
      closing = true;
      server.close(async () => { await mongoose.disconnect(); process.exit(0); });
      setTimeout(() => process.exit(1), 10000).unref();
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error('Startup failed:', error.message);
    process.exit(1);
  }
}

startServer();
