import mongoose from "mongoose";

const invoiceItemSchema = new mongoose.Schema({
  deliveryId: { type: mongoose.Schema.Types.ObjectId, ref: "Delivery" },
  deliveryNumber: String,
  deliveryDate: Date,
  deliveryGrandTotal: Number, // Store original delivery total
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item" },
  itemCode: String,
  itemName: String,
  quantity: Number,
  unitPrice: Number,
  discount: Number,
  totalAmount: Number,
  gstAmount: Number,
  gstRate: Number,
  freight: Number
});

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, unique: true },
  
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
  customerCode: String,
  customerName: String,
  customerGST: String,
  customerAddress: Object,
  
  period: {
    month: Number,
    year: Number,
    fromDate: Date,
    toDate: Date
  },
  
  deliveries: [{ type: mongoose.Schema.Types.ObjectId, ref: "Delivery" }],
  deliveryCount: { type: Number, default: 0 },
  
  items: [invoiceItemSchema],
  totalItems: { type: Number, default: 0 },
  
  // Financials - These should sum up to grandTotal
  subtotal: { type: Number, default: 0 },
  gstTotal: { type: Number, default: 0 },
  freightTotal: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 }, // This is the final amount
  
  status: { 
    type: String, 
    enum: ["Draft", "Generated", "Sent", "Paid", "Overdue", "Cancelled"],
    default: "Generated"
  },
  paymentStatus: {
    type: String,
    enum: ["Pending", "Partial", "Paid"],
    default: "Pending"
  },
  paidAmount: { type: Number, default: 0 },
  paymentDate: Date,
  
  invoiceDate: { type: Date, default: Date.now },
  dueDate: Date,
  
  remarks: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  batchId: String,
  
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileType: String
  }]
}, { timestamps: true });

invoiceSchema.pre("save", async function(next) {
  if (!this.invoiceNumber) {
    const year = new Date().getFullYear();
    const count = await mongoose.model("Invoice").countDocuments();
    this.invoiceNumber = `INV-${year}-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

export default mongoose.models.Invoice || mongoose.model("Invoice", invoiceSchema);