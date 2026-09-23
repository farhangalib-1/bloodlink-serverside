const express = require("express");
require("dotenv").config();
const cors = require("cors");
const app = express();
app.use(cors());
app.use(express.json());
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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
   
    // await client.connect();
    const db = client.db("bloodlink");
    const usersCollection = db.collection("user")
    const blogsCollection = db.collection("blogs")
    const paymentCollection = db.collection("payment")
    app.get("/allusers", async(req, res) =>{
        const cursor = await usersCollection.find();
        const users = await cursor.toArray();
        res.send(users);
    })
    app.get("/users", async (req, res) =>{
        const cursor = await usersCollection.find({role:"donor"});
        const users = await cursor.toArray();
        res.send(users);
    })
     app.post("/blogs", async (req, res) =>{
      const blog = req.body;
      const result = await blogsCollection.insertOne(blog);
      res.send(result);
    })

    app.get("/blogs", async (req, res) =>{
      const cursor = await blogsCollection.find();
      const blogs = await cursor.toArray();
      res.send(blogs);
    }
  )
  app.get("/blogs/:id", async (req, res) =>{
    const {id} = req.params;
    const query = {
      _id: new ObjectId(id)
    } 
    const blog = await blogsCollection.findOne(query);
    res.send(blog);
  })
  app.get("/users/:id", async (req, res) =>{
    const {id} = req.params;
    const query = {
      _id: new ObjectId(id)
    }
    const user = await usersCollection.findOne(query);
    res.send(user);
  })
  app.post("/payment", async(req, res) =>{
    const payment = req.body;
    const result = await paymentCollection.insertOne(payment);
    res.send(result);
  })

  app.get("/payment", async(req, res) =>{
    const cursor = await paymentCollection.find();
    const payments = await cursor.toArray();
    res.send(payments);
  })

  app.delete("/users/:id", async (req, res) =>{
    const id = req.params.id;
    const query ={
      _id: new ObjectId(id)
    }
    const result = await usersCollection.deleteOne(query);
    res.send(result);
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
