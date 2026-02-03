const { MongoClient } = require('mongodb');

let client;
let db;

async function getMongoDb() {
  if (db) {
    return db;
  }
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/academic-community';
  client = new MongoClient(uri);
  await client.connect();
  db = client.db('academic-community');
  return db;
}

async function closeMongo() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

module.exports = {
  getMongoDb,
  closeMongo,
};
