const { MongoClient, ObjectId } = require("mongodb");
const logger = require("./logger");

let client = null;
let dbInstance = null;
let todosCollection = null;
let isMongoAvailable = false;

// Fallback in-memory store for local standalone development when MongoDB daemon is not running
let inMemoryTodos = [
  {
    id: "1",
    title: "Deploy SentinelOpsAI to Kubernetes",
    description: "Prepare manifests, ConfigMaps, and Services with named ports",
    priority: "high",
    completed: false,
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "2",
    title: "Configure Prometheus ServiceMonitor",
    description: "Ensure release: monitoring label and scrape backend /metrics",
    priority: "high",
    completed: false,
    created_at: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: "3",
    title: "Verify OOMKilled simulation scenario",
    description: "Run /simulate/leak and observe container memory hit 200Mi limit",
    priority: "medium",
    completed: true,
    created_at: new Date(Date.now() - 900000).toISOString(),
  },
];
let nextInMemoryId = 4;

// Helper to normalize MongoDB documents for API output
function formatTodo(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return {
    id: _id ? _id.toString() : rest.id,
    _id: _id ? _id.toString() : rest.id,
    ...rest,
  };
}

async function initDb() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/sentinelops";
  const dbName = process.env.MONGODB_DB_NAME || "sentinelops";

  try {
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000,
    });

    await client.connect();
    dbInstance = client.db(dbName);
    todosCollection = dbInstance.collection("todos");

    // Ping the deployment to confirm connection
    await dbInstance.command({ ping: 1 });

    // Ensure index on created_at for fast ordering
    await todosCollection.createIndex({ created_at: -1 });

    isMongoAvailable = true;
    logger.info("Connected to MongoDB database and initialized todos collection", {
      uri: uri.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@"), // sanitize auth
      database: dbName,
    });
  } catch (err) {
    isMongoAvailable = false;
    logger.warn("Failed to connect to MongoDB; falling back to in-memory store", {
      error: err.message,
      uri: uri.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@"),
      tip: "Start local MongoDB daemon with 'mongod' or run docker run -p 27017:27017 mongo",
    });
  }
}

const db = {
  initDb,

  isMongo() {
    return isMongoAvailable;
  },

  async getTodos() {
    if (isMongoAvailable && todosCollection) {
      const docs = await todosCollection.find({}).sort({ created_at: -1 }).toArray();
      return docs.map(formatTodo);
    }
    return [...inMemoryTodos].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async createTodo({ title, description = "", priority = "medium" }) {
    const doc = {
      title,
      description,
      priority,
      completed: false,
      created_at: new Date().toISOString(),
    };

    if (isMongoAvailable && todosCollection) {
      const result = await todosCollection.insertOne(doc);
      return formatTodo({ _id: result.insertedId, ...doc });
    }

    const newTodo = {
      id: String(nextInMemoryId++),
      ...doc,
    };
    inMemoryTodos.push(newTodo);
    return newTodo;
  },

  async updateTodo(id, updates) {
    if (isMongoAvailable && todosCollection) {
      let query;
      if (ObjectId.isValid(id)) {
        query = { _id: new ObjectId(id) };
      } else {
        query = { id: String(id) };
      }

      const allowedUpdates = {};
      if (updates.title !== undefined) allowedUpdates.title = updates.title;
      if (updates.description !== undefined) allowedUpdates.description = updates.description;
      if (updates.priority !== undefined) allowedUpdates.priority = updates.priority;
      if (updates.completed !== undefined) allowedUpdates.completed = updates.completed;
      allowedUpdates.updated_at = new Date().toISOString();

      const result = await todosCollection.findOneAndUpdate(
        query,
        { $set: allowedUpdates },
        { returnDocument: "after" }
      );

      return formatTodo(result);
    }

    const index = inMemoryTodos.findIndex((t) => String(t.id) === String(id));
    if (index === -1) return null;
    inMemoryTodos[index] = { ...inMemoryTodos[index], ...updates };
    return inMemoryTodos[index];
  },

  async deleteTodo(id) {
    if (isMongoAvailable && todosCollection) {
      let query;
      if (ObjectId.isValid(id)) {
        query = { _id: new ObjectId(id) };
      } else {
        query = { id: String(id) };
      }

      const result = await todosCollection.deleteOne(query);
      return result.deletedCount > 0;
    }

    const index = inMemoryTodos.findIndex((t) => String(t.id) === String(id));
    if (index === -1) return false;
    inMemoryTodos.splice(index, 1);
    return true;
  },

  async close() {
    if (client) {
      await client.close();
    }
  },
};

module.exports = db;
