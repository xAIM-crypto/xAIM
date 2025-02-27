const express = require('express');
const path = require('path');
const apiRouter = require('./routes/api'); // points to routes/api.js
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable JSON parsing in request bodies
app.use(express.json());

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// Mount API routes under /api
app.use('/api', apiRouter);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
