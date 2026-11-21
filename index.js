
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

  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

function getDateTwoMonthsAgo() {
  const date = new Date();

  date.setUTCHours(0, 0, 0, 0);
  date.setUTCMonth(date.getUTCMonth() - 2);

  return date.toISOString().slice(0, 10);
}

// Escape user-provided values before inserting them into HTML emails.
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[char];
  });
}

// Send donation application status notification using Resend.
async function sendDonationStatusEmail(application, status) {
  const apiKey = process.env.RESEND_API_KEY;
  const sender = process.env.EMAIL_FROM;

  if (!apiKey || !sender) {
    throw new Error("Email service environment variables are missing.");
  }

  const name = escapeHtml(application.name);
  const bloodType = escapeHtml(application.bloodType);

  const approved = status === "approved";

  const subject = approved
    ? "Your BloodLink Donation Request Has Been Approved"
    : "Update on Your BloodLink Donation Request";

  const heading = approved
    ? "Your donation request has been approved!"
    : "Your donation request was not approved";

  const message = approved
    ? "We are pleased to inform you that your blood donation application has been approved by our administration."
    : "After reviewing your application, our administration was unable to approve your blood donation request at this time.";

  const color = approved ? "#16a34a" : "#dc2626";

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="margin:0;padding:30px 15px;background:#f8fafc;font-family:Arial,sans-serif;color:#1f2937;">
        <div style="max-width:560px;margin:auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">

          <div style="background:#e9232b;padding:22px;text-align:center;color:white;">
            <h1 style="margin:0;font-size:25px;">BloodLink</h1>
            <p style="margin:6px 0 0;font-size:13px;">Saving Lives Together</p>
          </div>

          <div style="padding:30px;">
            <h2 style="color:${color};font-size:22px;">
              ${heading}
            </h2>

            <p>Hello ${name},</p>

            <p style="line-height:1.7;">
              ${message}
            </p>

            <div style="background:#f8fafc;border-radius:8px;padding:18px;margin:22px 0;">
              <p style="margin:0 0 10px;"><strong>Application Details</strong></p>

              <p style="margin:6px 0;">Donor: ${name}</p>

              <p style="margin:6px 0;">Blood Group: ${bloodType}</p>

              <p style="margin:6px 0;">
                Status:
                <strong style="color:${color};">
                  ${approved ? "Approved" : "Denied"}
                </strong>
              </p>
            </div>

            <p style="line-height:1.7;">
              ${
                approved
                  ? "Thank you for your willingness to help save lives. Your generosity makes a difference!"
                  : "Thank you for your interest in donating blood. We appreciate your willingness to help others."
              }
            </p>

            <p style="margin-top:28px;">
              Best regards,<br/>
              <strong>BloodLink Team</strong>
            </p>
          </div>

          <div style="background:#f8fafc;padding:16px;text-align:center;font-size:11px;color:#94a3b8;">
            This is an automated notification from BloodLink.
            Please do not reply directly to this email.
          </div>

        </div>
      </body>
    </html>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",

    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      from: sender,
      to: [application.email],
      subject,
      html,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    console.error("Resend email error:", result);
    throw new Error("Failed to send notification email.");
  }

  return result;
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
        return res.status(400).send({
          message: "Invalid blog ID.",
        });
      }

      const blog = await blogsCollection.findOne({
        _id: new ObjectId(id),
      });

      res.send(blog);
    });

    app.get("/users/:id", async (req, res) => {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({
          message: "Invalid user ID.",
        });
      }

      const user = await usersCollection.findOne({
        _id: new ObjectId(id),
      });

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

    // Create a donation application.
    // New applications always start as pending.
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
      const cleanEmail = typeof email === "string"
        ? email.trim().toLowerCase()
        : "";
      const cleanAddress = typeof address === "string"
        ? address.trim()
        : "";

      const numericAge = Number(age);

      if (!cleanName || cleanName.length > 120) {
        return res.status(400).send({
          message: "Please provide a valid full name.",
        });
      }

      if (!Number.isInteger(numericAge) || numericAge < 18 || numericAge > 65) {
        return res.status(400).send({
          message: "Donors must be between 18 and 65 years old.",
        });
      }

      if (!cleanPhone || cleanPhone.length > 30) {
        return res.status(400).send({
          message: "Please provide a valid phone number.",
        });
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) {
        return res.status(400).send({
          message: "Please provide a valid email address.",
        });
      }

      if (!cleanAddress || cleanAddress.length > 500) {
        return res.status(400).send({
          message: "Please provide a valid address.",
        });
      }

      if (!bloodTypes.includes(bloodType)) {
        return res.status(400).send({
          message: "Please select a valid blood type.",
        });
      }

      if (typeof firstTimeDonor !== "boolean") {
        return res.status(400).send({
          message: "Please specify whether you are a first-time donor.",
        });
      }

      let normalizedPreviousDate = null;

      if (!firstTimeDonor) {
        if (!isValidDateString(previousDonationDate)) {
          return res.status(400).send({
            message: "Please provide a valid previous donation date.",
          });
        }

        const today = new Date().toISOString().slice(0, 10);

        if (previousDonationDate > today) {
          return res.status(400).send({
            message: "Previous donation date cannot be in the future.",
          });
        }

        if (previousDonationDate > getDateTwoMonthsAgo()) {
          return res.status(400).send({
            message: "You must wait at least two months after your previous blood donation.",
          });
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

    // Admin review action + automatic donor email notification.
    app.patch("/donation-requests/:id", async (req, res) => {
      const { id } = req.params;
      const { status } = req.body || {};

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({
          message: "Invalid donation request ID.",
        });
      }

      if (!["approved", "denied"].includes(status)) {
        return res.status(400).send({
          message: "Status must be either approved or denied.",
        });
      }

      // Only allow pending applications to be reviewed.
      const result = await donationRequestsCollection.updateOne(
        {
          _id: new ObjectId(id),
          status: "pending",
        },
        {
          $set: {
            status,
            reviewedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        const existingRequest = await donationRequestsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!existingRequest) {
          return res.status(404).send({
            message: "Donation request not found.",
          });
        }

        return res.status(409).send({
          message: "This application has already been reviewed.",
          request: existingRequest,
        });
      }

      const updatedRequest = await donationRequestsCollection.findOne({
        _id: new ObjectId(id),
      });

      // Send notification after the database update.
      try {
        const emailResult = await sendDonationStatusEmail(
          updatedRequest,
          status
        );

        console.log(
          `Notification email sent to ${updatedRequest.email}. Email ID: ${emailResult.id}`
        );

        return res.send({
          message: `Application ${status}. Notification email sent successfully.`,
          emailSent: true,
          request: updatedRequest,
        });
      } catch (error) {
        console.error("Donation notification failed:", error);

        return res.status(200).send({
          message: `Application ${status}, but the notification email could not be sent.`,
          emailSent: false,
          request: updatedRequest,
        });
      }
    });

    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({
          message: "Invalid user ID.",
        });
      }

      const result = await usersCollection.deleteOne({
        _id: new ObjectId(id),
      });

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
  console.log(
    `server is running on port ${process.env.PORT || 5000}`
  );
});
