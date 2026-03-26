import mongoose from "mongoose";

const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  throw new Error("Missing MONGODB_URI environment variable.");
}

const MONGODB_URI: string = mongoUri;

type MongooseGlobal = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalWithMongoose = globalThis as typeof globalThis & {
  mongoose?: MongooseGlobal;
};

const cached: MongooseGlobal = globalWithMongoose.mongoose ?? {
  conn: null,
  promise: null,
};

if (!globalWithMongoose.mongoose) {
  globalWithMongoose.mongoose = cached;
}

export async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}