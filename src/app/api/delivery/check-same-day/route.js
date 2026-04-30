import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Delivery from "@/models/Delivery";
import { getTokenFromHeader, verifyJWT } from "@/lib/auth";

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
    const customerId = searchParams.get("customerId");
    const deliveryDate = searchParams.get("deliveryDate");
    
    if (!customerId || !deliveryDate) {
      return NextResponse.json({ success: false, message: "Missing required parameters" }, { status: 400 });
    }
    
    const startDate = new Date(deliveryDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(deliveryDate);
    endDate.setHours(23, 59, 59, 999);
    
    const deliveries = await Delivery.find({
      "items.customer": customerId,
      deliveryDate: { $gte: startDate, $lte: endDate },
      status: { $nin: ["Cancelled"] }
    }).select("deliveryNumber deliveryDate timeSlot grandTotal status");
    
    return NextResponse.json({
      success: true,
      count: deliveries.length,
      deliveries
    });
  } catch (error) {
    console.error("Error checking deliveries:", error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}