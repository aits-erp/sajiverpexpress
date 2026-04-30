import mongoose from "mongoose";

const deliveryItemSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true },
  itemCode: String,
  itemName: String,
  itemDescription: String,
  quantity: { type: Number, required: true, min: 0 },
  allowedQuantity: Number,
  receivedQuantity: Number,
  unitPrice: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  freight: { type: Number, default: 0 },
  taxOption: { type: String, enum: ["GST", "IGST"], default: "GST" },
  gstRate: { type: Number, default: 0 },
  igstRate: { type: Number, default: 0 },
  
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
  customerCode: String,
  customerName: String,
  contactPerson: String,
  customerBillingAddress: mongoose.Schema.Types.Mixed,
  customerShippingAddress: mongoose.Schema.Types.Mixed,
  
  priceAfterDiscount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  gstAmount: { type: Number, default: 0 },
  cgstAmount: { type: Number, default: 0 },
  sgstAmount: { type: Number, default: 0 },
  igstAmount: { type: Number, default: 0 },
  
  // NEW: Track if this specific item is invoiced
  isItemInvoiced: { type: Boolean, default: false },
  itemInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice" },
  itemInvoicedAt: Date,
  
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse" },
  warehouseName: String,
  warehouseCode: String,
  binLocations: Array,
  selectedBin: Object,
  managedByBatch: { type: Boolean, default: false }
}, { timestamps: true });

const deliverySchema = new mongoose.Schema({
  deliveryNumber: { type: String, unique: true, sparse: true },
  deliverySequence: { type: Number, default: 1 },
  refNumber: String,
  salesEmployee: String,
  
  status: { 
    type: String, 
    enum: ["Draft", "Open", "Pending", "Shipped", "Delivered", "Cancelled", "PartiallyInvoiced", "FullyInvoiced"],
    default: "Draft" 
  },
  
  deliveryDate: { type: Date, required: true },
  expectedDeliveryDate: Date,
  timeSlot: { type: String },
  deliveryShift: { type: Number, default: 1 },
  
  items: [deliveryItemSchema],
  
  remarks: String,
  freight: { type: Number, default: 0 },
  rounding: { type: Number, default: 0 },
  totalDownPayment: { type: Number, default: 0 },
  appliedAmounts: { type: Number, default: 0 },
  totalBeforeDiscount: { type: Number, default: 0 },
  gstTotal: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  openBalance: { type: Number, default: 0 },
  
  // Legacy fields (keep for compatibility)
  isInvoiced: { type: Boolean, default: false },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice" },
  invoicedAt: Date,
  invoiceMonth: { type: Number },
  invoiceYear: { type: Number },
  batchInvoiceId: { type: String },
  
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileType: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

// Indexes
deliverySchema.index({ deliveryNumber: 1 }, { unique: true, sparse: true });
deliverySchema.index({ deliveryDate: -1 });
deliverySchema.index({ status: 1 });
deliverySchema.index({ "items.customer": 1 });
deliverySchema.index({ "items.isItemInvoiced": 1 });

// Pre-save middleware
deliverySchema.pre("save", async function(next) {
  if (!this.deliveryNumber) {
    try {
      const date = new Date(this.deliveryDate);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}${month}${day}`;
      
      const Delivery = mongoose.model("Delivery");
      const lastDelivery = await Delivery.findOne({
        deliveryNumber: { $regex: `^DEL-${dateStr}` }
      }).sort({ deliverySequence: -1 });
      
      const sequence = (lastDelivery?.deliverySequence || 0) + 1;
      this.deliverySequence = sequence;
      this.deliveryNumber = `DEL-${dateStr}-${String(sequence).padStart(3, '0')}`;
    } catch (error) {
      console.error("Error generating delivery number:", error);
      this.deliveryNumber = `DEL-${Date.now()}`;
    }
  }
  next();
});

export default mongoose.models.Delivery || mongoose.model("Delivery", deliverySchema);





// import mongoose from "mongoose";

// const deliveryItemSchema = new mongoose.Schema({
//   item: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true },
//   itemCode: String,
//   itemName: String,
//   itemDescription: String,
//   quantity: { type: Number, required: true, min: 0 },
//   allowedQuantity: Number,
//   receivedQuantity: Number,
//   unitPrice: { type: Number, default: 0 },
//   discount: { type: Number, default: 0 },
//   freight: { type: Number, default: 0 },
//   taxOption: { type: String, enum: ["GST", "IGST"], default: "GST" },
//   gstRate: { type: Number, default: 0 },
//   igstRate: { type: Number, default: 0 },
  
//   customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
//   customerCode: String,
//   customerName: String,
//   contactPerson: String,
//   customerBillingAddress: mongoose.Schema.Types.Mixed,
//   customerShippingAddress: mongoose.Schema.Types.Mixed,
  
//   priceAfterDiscount: { type: Number, default: 0 },
//   totalAmount: { type: Number, default: 0 },
//   gstAmount: { type: Number, default: 0 },
//   cgstAmount: { type: Number, default: 0 },
//   sgstAmount: { type: Number, default: 0 },
//   igstAmount: { type: Number, default: 0 },
  

//   warehouseName: String,
//   warehouseCode: String,
//   binLocations: Array,
//   selectedBin: Object,
//   managedByBatch: { type: Boolean, default: false }
// }, { timestamps: true });

// const deliverySchema = new mongoose.Schema({
//   deliveryNumber: { type: String },
//   deliverySequence: { type: Number, default: 1 },
//   refNumber: String,
//   salesEmployee: String,
//   status: { 
//     type: String, 
//     enum: ["Draft", "Open", "Pending", "Shipped", "Delivered", "Cancelled", "Invoiced"],
//     default: "Draft" 
//   },
//   deliveryDate: { type: Date, required: true },
//   expectedDeliveryDate: Date,
//   timeSlot: { type: String },
//   deliveryShift: { type: Number, default: 1 },
  
//   items: [deliveryItemSchema],
  
//   remarks: String,
//   freight: { type: Number, default: 0 },
//   rounding: { type: Number, default: 0 },
//   totalDownPayment: { type: Number, default: 0 },
//   appliedAmounts: { type: Number, default: 0 },
//   totalBeforeDiscount: { type: Number, default: 0 },
//   gstTotal: { type: Number, default: 0 },
//   grandTotal: { type: Number, default: 0 },
//   openBalance: { type: Number, default: 0 },
  
//   isInvoiced: { type: Boolean, default: false },
//   invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice" },
//   invoicedAt: Date,
  
//   attachments: [{
//     fileName: String,
//     fileUrl: String,
//     fileType: String,
//     uploadedAt: { type: Date, default: Date.now }
//   }],
//     // For monthly invoicing tracking
//   invoiceMonth: { type: Number }, // 1-12
//   invoiceYear: { type: Number },
//   isInvoiced: { type: Boolean, default: false },
//   invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice" },
//   invoicedAt: Date,
//   batchInvoiceId: { type: String }, // To group invoices from same batch
  
//   createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
//   updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
// }, { timestamps: true });

// // Create indexes
// deliverySchema.index({ deliveryNumber: 1 }, { unique: true, sparse: true });
// deliverySchema.index({ deliveryDate: -1 });
// deliverySchema.index({ status: 1 });
// deliverySchema.index({ "items.customer": 1 });
// deliverySchema.index({ isInvoiced: 1 });

// // Pre-save middleware
// deliverySchema.pre("save", async function(next) {
//   if (!this.deliveryNumber) {
//     try {
//       const date = new Date(this.deliveryDate);
//       const year = date.getFullYear();
//       const month = String(date.getMonth() + 1).padStart(2, '0');
//       const day = String(date.getDate()).padStart(2, '0');
//       const dateStr = `${year}${month}${day}`;
      
//       const Delivery = mongoose.model("Delivery");
//       const lastDelivery = await Delivery.findOne({
//         deliveryNumber: { $regex: `^DEL-${dateStr}` }
//       }).sort({ deliverySequence: -1 });
      
//       const sequence = (lastDelivery?.deliverySequence || 0) + 1;
//       this.deliverySequence = sequence;
//       this.deliveryNumber = `DEL-${dateStr}-${String(sequence).padStart(3, '0')}`;
//     } catch (error) {
//       console.error("Error generating delivery number:", error);
//       this.deliveryNumber = `DEL-${Date.now()}`;
//     }
//   }
//   next();
// });

// // Simple export without auto-sync
// export default mongoose.models.Delivery || mongoose.model("Delivery", deliverySchema);