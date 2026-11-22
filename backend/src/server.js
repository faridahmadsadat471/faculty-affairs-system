import 'dotenv/config';
import app from './app.js';
import { connectDB } from './config/db.js';

const port = Number(process.env.PORT) || 5000;

async function startServer() {
  try {
    await connectDB();

    const server = app.listen(port, () => {
      console.log(`Faculty Affairs API listening on port ${port}`);
    });

    server.on('error', (error) => {
      console.error('Server failed:', error.message);
      process.exit(1);
    });
  } catch (error) {
    console.error('Startup failed:', error.message);
    process.exit(1);
  }
}

startServer();
