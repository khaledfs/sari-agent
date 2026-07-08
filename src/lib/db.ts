import dns from "dns";
import mongoose from "mongoose";

// Force Node's DNS resolver to use Google DNS — some Windows networks
// register an IPv6 link-local resolver (fe80::1) that Node's SRV lookups
// (querySrv) cannot reach, even though the OS-level resolver works fine.
dns.setServers(["8.8.8.8", "8.8.4.4"]);

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