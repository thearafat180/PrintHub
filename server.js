// server.js (Final Public Upload Version with Preset)
import express from "express";
import multer from "multer";
import cors from 'cors';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = 5000;

// --- Cloudinary and MongoDB Configuration ---
cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Connection to MongoDB database successful'))
    .catch(err => console.error('❌ Error connecting to MongoDB:', err));

// --- Multer Configuration for PUBLIC Cloudinary Uploads ---
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'print_uploads_public',
        // resource_type: "auto",
        resource_type: "raw",
        // This forces Cloudinary to use our new unsigned preset
        upload_preset: 'my_unsigned_preset', 
    },
});

const upload = multer({ storage: storage });

// --- Mongoose Schema and Model ---
const FileSchema = new mongoose.Schema({
    fileName: String,
    savedAs: String,
    path: String, // This will store the public Cloudinary URL
    from: String,
    to: String,
    color: String,
    copies: Number,
    detectedPages: Number,
});

const OrderSchema = new mongoose.Schema({
    gateway: String,
    totalCost: String,
    uploadTimestamp: { type: Date, default: Date.now },
    files: [FileSchema],
    status: { type: String, default: 'pending', enum: ['pending', 'processing', 'completed', 'failed'] }
});

const Order = mongoose.model('Order', OrderSchema);

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- API Routes ---

app.post("/api/upload", upload.array("files"), async (req, res) => {
    console.log("--- New Upload Request Received ---");
    try {
        if (!req.body.fileRanges) {
            return res.status(400).json({ success: false, error: "File metadata (fileRanges) is missing." });
        }
        const fileRanges = JSON.parse(req.body.fileRanges);
        const metadataMap = new Map(fileRanges.map(meta => [meta.name, meta]));

        const uploadData = req.files.map(file => {
            const meta = metadataMap.get(file.originalname);
            return {
                fileName: file.originalname,
                savedAs: file.filename,
                path: file.path, 
                from: meta?.from,
                to: meta?.to,
                color: meta?.color,
                copies: meta?.copies,
                detectedPages: meta?.detectedPages,
            };
        });
        
        const newOrderPayload = {
            gateway: req.body.gateway,
            totalCost: req.body.totalCost,
            files: uploadData,
            status: 'pending'
        };

        const newOrder = new Order(newOrderPayload);
        await newOrder.save();
        
        console.log(`✅ Order saved to database successfully. Order ID: ${newOrder._id}`);
        res.status(201).json({ success: true, message: "Order created successfully.", orderId: newOrder._id });

    } catch (err) {
        console.error("Error processing upload:", err);
        res.status(500).json({ success: false, error: "An internal server error occurred." });
    }
});

app.get("/api/print-jobs/new", async (req, res) => {
    try {
        const job = await Order.findOneAndUpdate(
            { status: 'pending' }, 
            { $set: { status: 'processing' } },
            { new: true, sort: { uploadTimestamp: 1 } }
        );

        if (job) {
            console.log(`[API] New job dispatched: ${job._id}`);
            res.json(job);
        } else {
            res.status(404).json({ message: "No new print jobs found." });
        }
    } catch (error) {
        console.error("Error fetching new job:", error);
        res.status(500).json({ error: "Server error fetching new job." });
    }
});

app.patch("/api/print-jobs/:id/status", async (req, res) => {
    try {
        const { status } = req.body;
        const updatedJob = await Order.findByIdAndUpdate(req.params.id, { $set: { status: status } }, { new: true });
        if (updatedJob) {
            console.log(`[API] Job status updated: ${updatedJob._id} -> ${status}`);
            res.json({ success: true, message: `Job status updated to ${status}` });
        } else {
            res.status(404).json({ success: false, message: "Job not found." });
        }
    } catch (error) {
        res.status(500).json({ error: "Server error updating job status." });
    }
});

app.listen(port, () => {
    console.log(`✅ Server is running on https://printhub-azxa.onrender.com`);

});