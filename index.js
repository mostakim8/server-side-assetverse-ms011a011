const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const port = process.env.PORT || 5001;

// Middleware
app.use(cors({
    origin: [
        'http://localhost:5173', 
        'http://localhost:5174'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    optionsSuccessStatus: 200 // এটি যোগ করুন
}));
app.use(express.json());

// MongoDB URI

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@aimodelmanagerdb.du0jjco.mongodb.net/AssetVerseDB?retryWrites=true&w=majority&appName=AIModelManagerDB`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect(); 
    
    const db = client.db("AssetVerseDB");
    const usersCollection = db.collection("users");
    console.log("Connected successfully to MongoDB");
    app.post('/users', async (req, res) => {
      try {
        const user = req.body;
       
      
        const query = { email: user.email };
        const existingUser = await usersCollection.findOne(query);
        
        if (existingUser) {
          
          return res.send({ message: 'user already exists', insertedId: null });
        }
        
        const result = await usersCollection.insertOne(user);
       
        res.send(result);
      } catch (dbError) {
        console.error("Database Error:", dbError);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    console.log("Connected to MongoDB (AssetVerseDB)!");
  } catch (err) {
    console.error("Connection Error:", err);
  }
}
run().catch(console.dir);

app.get('/', (req, res) => res.send('AssetVerse Server Running'));

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});