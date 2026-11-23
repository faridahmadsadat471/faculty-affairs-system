import 'dotenv/config';
import app from './app.js';
import { connectDB } from './config/db.js';
import User from './models/user.model.js';
import RevokedToken from './models/revoked-token.model.js';
import Faculty from './models/faculty.model.js';
import { getJwtSecret } from './utils/jwt.js';

const port = Number(process.env.PORT) || 5000;

async function startServer() {
  try {
    getJwtSecret();
    await connectDB();
    await User.init();
    await RevokedToken.init();
    await Faculty.init();

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
