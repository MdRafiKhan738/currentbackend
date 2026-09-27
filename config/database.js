const mongoose = require("mongoose");

module.exports = async function connectDB() {
  const rawUri = process.env.MONGO_URI;

  if (!rawUri) {
    throw new Error("MONGO_URI is required");
  }

  // Render can preserve accidental surrounding quotes/whitespace
  // when a connection string is pasted into the environment variable.
  const uri = rawUri.trim().replace(/^(['"])(.*)\1$/, "$2").trim();

  if (!/^mongodb(?:\+srv)?:\/\//.test(uri)) {
    throw new Error(
      'MONGO_URI must start with "mongodb://" or "mongodb+srv://"'
    );
  }

  await mongoose.connect(uri);
  console.log("Investment MongoDB connected");
};
