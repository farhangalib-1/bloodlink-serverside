const express = require("express");
require("dotenv").config();
const cors = require("cors");
const app = express();
app.use(cors());
app.use(express.json());
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const bloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

// Parse a YYYY-MM-DD date without accepting invalid calendar dates.
function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getDateTwoMonthsAgo() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCMonth(date.getUTCMonth() - 2);
  return date.toISOString().slice(0, 10);
}

async function run() {
  try {
    // Keep this commented as requested. The MongoDB driver connects on demand.
    // await client.connect();
    const db = client.db("bloodlink");
    const usersCollection = db.collection("user");
    const blogsCollection = db.collection("blogs");
    const paymentCollection = db.collection("payment");
    const donationRequestsCollection = db.collection("donationRequests");

    app.get("/allusers", async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    app.get("/users", async (req, res) => {
      const users = await usersCollection.find({ role: "donor" }).toArray();
      res.send(users);
    });

    app.post("/blogs", async (req, res) => {
      const blog = req.body;
      const result = await blogsCollection.insertOne({
        ...blog,
        createdAt: new Date(),
      });
      res.send(result);
    });

    app.get("/blogs", async (req, res) => {
      const blogs = await blogsCollection.find().toArray();
      res.send(blogs);
    });

    app.get("/blogs/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid blog ID." });
      }
      const blog = await blogsCollection.findOne({ _id: new ObjectId(id) });
      res.send(blog);
    });

    app.get("/users/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid user ID." });
      }
      const user = await usersCollection.findOne({ _id: new ObjectId(id) });
      res.send(user);
    });

    app.post("/payment", async (req, res) => {
      const payment = req.body;
      const result = await paymentCollection.insertOne(payment);
      res.send(result);
    });

    app.get("/payment", async (req, res) => {
      const payments = await paymentCollection.find().toArray();
      res.send(payments);
    });

    // Create a donation application. New applications always start as pending.
    app.post("/donation-requests", async (req, res) => {
      const {
        name,
        age,
        phone,
        email,
        address,
        bloodType,
        firstTimeDonor,
        previousDonationDate,
      } = req.body || {};

      const cleanName = typeof name === "string" ? name.trim() : "";
      const cleanPhone = typeof phone === "string" ? phone.trim() : "";
      const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
      const cleanAddress = typeof address === "string" ? address.trim() : "";
      const numericAge = Number(age);

      if (!cleanName || cleanName.length > 120) {
        return res.status(400).send({ message: "Please provide a valid full name." });
      }
      if (!Number.isInteger(numericAge) || numericAge < 18 || numericAge > 65) {
        return res.status(400).send({ message: "Donors must be between 18 and 65 years old." });
      }
      if (!cleanPhone || cleanPhone.length > 30) {
        return res.status(400).send({ message: "Please provide a valid phone number." });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) {
        return res.status(400).send({ message: "Please provide a valid email address." });
      }
      if (!cleanAddress || cleanAddress.length > 500) {
        return res.status(400).send({ message: "Please provide a valid address." });
      }
      if (!bloodTypes.includes(bloodType)) {
        return res.status(400).send({ message: "Please select a valid blood type." });
      }
      if (typeof firstTimeDonor !== "boolean") {
        return res.status(400).send({ message: "Please specify whether you are a first-time donor." });
      }

      let normalizedPreviousDate = null;
      if (!firstTimeDonor) {
        if (!isValidDateString(previousDonationDate)) {
          return res.status(400).send({ message: "Please provide a valid previous donation date." });
        }
        const today = new Date().toISOString().slice(0, 10);
        if (previousDonationDate > today) {
          return res.status(400).send({ message: "Previous donation date cannot be in the future." });
        }
        if (previousDonationDate > getDateTwoMonthsAgo()) {
          return res.status(400).send({ message: "You must wait at least two months after your previous blood donation." });
        }
        normalizedPreviousDate = previousDonationDate;
      }

      const application = {
        name: cleanName,
        age: numericAge,
        phone: cleanPhone,
        email: cleanEmail,
        address: cleanAddress,
        bloodType,
        firstTimeDonor,
        previousDonationDate: normalizedPreviousDate,
        status: "pending",
        submittedAt: new Date(),
        reviewedAt: null,
      };

      const result = await donationRequestsCollection.insertOne(application);
      return res.status(201).send({
        message: "Donation application submitted successfully.",
        insertedId: result.insertedId,
      });
    });

    // Return all applications, newest first.
    app.get("/donation-requests", async (req, res) => {
      const requests = await donationRequestsCollection
        .find()
        .sort({ submittedAt: -1 })
        .toArray();
      res.send(requests);
    });

    // Admin review action. Only the two supported final statuses are accepted.
    app.patch("/donation-requests/:id", async (req, res) => {
      const { id } = req.params;
      const { status } = req.body || {};

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid donation request ID." });
      }
      if (!["approved", "denied"].includes(status)) {
        return res.status(400).send({ message: "Status must be either approved or denied." });
      }

      const result = await donationRequestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status, reviewedAt: new Date() } }
      );

      if (result.matchedCount === 0) {
        return res.status(404).send({ message: "Donation request not found." });
      }

      const updatedRequest = await donationRequestsCollection.findOne({ _id: new ObjectId(id) });
      return res.send({ message: `Application ${status}.`, request: updatedRequest });
    });

    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid user ID." });
      }
      const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    console.log("BloodLink API routes initialized.");
  } finally {
    // Existing connection lifecycle retained.
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.listen(process.env.PORT || 5000, () => {
  console.log(`server is running on port ${process.env.PORT || 5000}`);
});
