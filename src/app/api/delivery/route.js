import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Delivery from "@/models/Delivery";
import Item from "@/models/ItemModels";
import Warehouse from "@/models/warehouseModels";
import Customer from "@/models/CustomerModel";
import { getTokenFromHeader, verifyJWT } from "@/lib/auth";

// Helper function for file upload (implement based on your storage)
async function uploadFile(file) {
  // TODO: Implement your file upload logic (Cloudinary, AWS S3, etc.)
  // For now, return a placeholder
  return `/uploads/${Date.now()}_${file.name}`;
}

// GET - Fetch all deliveries with pagination and filters
export async function GET(req) {
  try {
    await connectDB();
    
    const token = getTokenFromHeader(req);
    if (!token) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    
    const decoded = verifyJWT(token);
    if (!decoded) {
      return NextResponse.json({ success: false, message: "Invalid token" }, { status: 401 });
    }
    
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page")) || 1;
    const limit = parseInt(searchParams.get("limit")) || 10;
    const status = searchParams.get("status");
    const customerId = searchParams.get("customerId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    
    let query = {};
    
    if (status) query.status = status;
    if (customerId) query["items.customer"] = customerId;
    if (startDate || endDate) {
      query.deliveryDate = {};
      if (startDate) query.deliveryDate.$gte = new Date(startDate);
      if (endDate) query.deliveryDate.$lte = new Date(endDate);
    }
    
    const skip = (page - 1) * limit;
    
    const [deliveries, total] = await Promise.all([
      Delivery.find(query)
        .populate("items.item", "itemName itemCode unitPrice imageUrl")
   
        .populate("items.customer", "customerName customerCode contactPersonName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Delivery.countDocuments(query)
    ]);
    
    return NextResponse.json({
      success: true,
      data: deliveries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("GET deliveries error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch deliveries" },
      { status: 500 }
    );
  }
}

// POST - Create new delivery
export async function POST(req) {
  try {
    await connectDB();
    
    const token = getTokenFromHeader(req);
    if (!token) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    
    const decoded = verifyJWT(token);
    if (!decoded) {
      return NextResponse.json({ success: false, message: "Invalid token" }, { status: 401 });
    }
    
    const formData = await req.formData();
    const deliveryData = JSON.parse(formData.get("deliveryData"));
    const newFiles = formData.getAll("newFiles");
    
    // Validate required fields
    if (!deliveryData.deliveryDate) {
      return NextResponse.json({ success: false, message: "Delivery date is required" }, { status: 400 });
    }
    
    if (!deliveryData.items || deliveryData.items.length === 0) {
      return NextResponse.json({ success: false, message: "At least one item is required" }, { status: 400 });
    }
    
    // Validate each item has customer (warehouse is optional)
    for (let i = 0; i < deliveryData.items.length; i++) {
      const item = deliveryData.items[i];
      
      // Customer validation (required)
      if (!item.customer) {
        return NextResponse.json({ 
          success: false, 
          message: `Item ${i + 1} requires a customer assignment` 
        }, { status: 400 });
      }
      
      // Verify customer exists
      const customerExists = await Customer.findById(item.customer);
      if (!customerExists) {
        return NextResponse.json({ 
          success: false, 
          message: `Customer not found for item ${i + 1}` 
        }, { status: 400 });
      }
      
      // Verify item exists
      const itemExists = await Item.findById(item.item);
      if (!itemExists) {
        return NextResponse.json({ 
          success: false, 
          message: `Item not found in row ${i + 1}` 
        }, { status: 400 });
      }
      
      // Warehouse validation (optional - only validate if provided)
      if (item.warehouse) {
        const warehouseExists = await Warehouse.findById(item.warehouse);
        if (!warehouseExists) {
          return NextResponse.json({ 
            success: false, 
            message: `Warehouse not found for item in row ${i + 1}` 
          }, { status: 400 });
        }
      }
    }
    
    // Process attachments
    const attachments = [];
    if (newFiles && newFiles.length > 0) {
      for (const file of newFiles) {
        const fileUrl = await uploadFile(file);
        attachments.push({
          fileName: file.name,
          fileUrl: fileUrl,
          fileType: file.type,
          uploadedAt: new Date()
        });
      }
    }
    
    // Add existing attachments from form data
    if (deliveryData.existingFiles && deliveryData.existingFiles.length > 0) {
      attachments.push(...deliveryData.existingFiles);
    }
    
    // Generate delivery number with sequence for same day
    let deliveryNumber = deliveryData.deliveryNumber;
    if (!deliveryNumber) {
      const date = new Date(deliveryData.deliveryDate);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}${month}${day}`;
      
      // Find last delivery for this date
      const lastDelivery = await Delivery.findOne({
        deliveryDate: {
          $gte: new Date(year, date.getMonth(), day),
          $lt: new Date(year, date.getMonth(), day + 1)
        }
      }).sort({ deliverySequence: -1 });
      
      const sequence = (lastDelivery?.deliverySequence || 0) + 1;
      deliveryNumber = `DEL-${dateStr}-${String(sequence).padStart(3, '0')}`;
      deliveryData.deliverySequence = sequence;
    }
    
    const delivery = new Delivery({
      ...deliveryData,
      deliveryNumber,
      attachments,
      createdBy: decoded.userId,
      createdAt: new Date()
    });
    
    await delivery.save();
    
    // Populate references for response
    await delivery.populate([
      { path: "items.item", select: "itemName itemCode unitPrice imageUrl" },
    //   { path: "items.warehouse", select: "warehouseName warehouseCode" },
      { path: "items.customer", select: "customerName customerCode contactPersonName" }
    ]);
    
    return NextResponse.json({
      success: true,
      data: delivery,
      message: "Delivery created successfully"
    });
  } catch (error) {
    console.error("POST delivery error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to create delivery" },
      { status: 500 }
    );
  }
}