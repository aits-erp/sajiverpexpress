// app/api/delivery/[id]/route.js
import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Delivery from "@/models/Delivery";
import Item from "@/models/ItemModels";
import Warehouse from "@/models/warehouseModels";
import Customer from "@/models/CustomerModel";
import { getTokenFromHeader, verifyJWT } from "@/lib/auth";

// Helper function for file deletion
async function deleteFile(fileUrl) {
  // TODO: Implement your file deletion logic
  console.log("Deleting file:", fileUrl);
}

// GET - Fetch single delivery by ID
export async function GET(req, { params }) {
  try {
    await connectDB();
    
    // const token = getTokenFromHeader(req);
    // if (!token) {
    //   return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    // }
    
    // const decoded = verifyJWT(token);
    // if (!decoded) {
    //   return NextResponse.json({ success: false, message: "Invalid token" }, { status: 401 });
    // }
    
    const { id } = params;
    
    const delivery = await Delivery.findById(id)
      .populate("items.item", "itemName itemCode unitPrice imageUrl description gstRate")
   
      .populate("items.customer", "customerName customerCode contactPersonName email phone")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .lean();
    
    if (!delivery) {
      return NextResponse.json({ success: false, message: "Delivery not found" }, { status: 404 });
    }
    
    return NextResponse.json({
      success: true,
      data: delivery
    });
  } catch (error) {
    console.error("GET delivery error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch delivery" },
      { status: 500 }
    );
  }
}

// PUT - Update delivery by ID
export async function PUT(req, { params }) {
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
    
    const { id } = params;
    
    // Check if delivery exists
    const existingDelivery = await Delivery.findById(id);
    if (!existingDelivery) {
      return NextResponse.json({ success: false, message: "Delivery not found" }, { status: 404 });
    }
    
    const formData = await req.formData();
    const deliveryData = JSON.parse(formData.get("deliveryData"));
    const newFiles = formData.getAll("newFiles");
    const removedFiles = deliveryData.removedFiles || [];
    
    // Validate items
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
      
    }
    
    // Handle attachments
    let attachments = [...(existingDelivery.attachments || [])];
    
    // Remove deleted files
    if (removedFiles.length > 0) {
      attachments = attachments.filter(att => 
        !removedFiles.some(removed => removed.fileUrl === att.fileUrl)
      );
      for (const file of removedFiles) {
        await deleteFile(file.fileUrl);
      }
    }
    
    // Upload new files
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
    
    const updatedDelivery = await Delivery.findByIdAndUpdate(
      id,
      {
        ...deliveryData,
        attachments,
        updatedBy: decoded.userId,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    )
    .populate("items.item", "itemName itemCode unitPrice imageUrl")

    .populate("items.customer", "customerName customerCode contactPersonName");
    
    return NextResponse.json({
      success: true,
      data: updatedDelivery,
      message: "Delivery updated successfully"
    });
  } catch (error) {
    console.error("PUT delivery error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to update delivery" },
      { status: 500 }
    );
  }
}

// DELETE - Delete delivery by ID
export async function DELETE(req, { params }) {
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
    
    const { id } = params;
    
    const delivery = await Delivery.findById(id);
    if (!delivery) {
      return NextResponse.json({ success: false, message: "Delivery not found" }, { status: 404 });
    }
    
    // Delete attachments from storage
    if (delivery.attachments && delivery.attachments.length > 0) {
      for (const attachment of delivery.attachments) {
        await deleteFile(attachment.fileUrl);
      }
    }
    
    await Delivery.findByIdAndDelete(id);
    
    return NextResponse.json({
      success: true,
      message: "Delivery deleted successfully"
    });
  } catch (error) {
    console.error("DELETE delivery error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to delete delivery" },
      { status: 500 }
    );
  }
}

// Helper function for file upload
async function uploadFile(file) {
  // TODO: Implement your file upload logic here
  // Example for Cloudinary:
  // const formData = new FormData();
  // formData.append("file", file);
  // formData.append("upload_preset", "your_preset");
  // const response = await fetch("https://api.cloudinary.com/v1_1/your_cloud/upload", {
  //   method: "POST",
  //   body: formData
  // });
  // const data = await response.json();
  // return data.secure_url;
  
  // Temporary: return a placeholder
  return `/uploads/${Date.now()}_${file.name}`;
}