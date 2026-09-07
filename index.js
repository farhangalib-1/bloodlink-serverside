const express = require("express");
require("dotenv").config();
const cors = require("cors");
const app = express();
app.use(cors());
app.use(express.json());
const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = process.env.MONGODB_URI;
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
    const db = client.db("bloodlink");
    const usersCollection = db.collection("user")
    app.get("/users", async (req, res) =>{
        const result = await usersCollection.find()
        const users = await result.toArray();
        res.send(users);
    })

    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    
  }
}
run().catch(console.dir);
app.get("/", (req, res) =>{
    res.send("Sever is running");
})
app.listen(process.env.PORT || 5000, () =>{
    console.log(`server is running on port ${process.env.PORT || 5000}`);

})
