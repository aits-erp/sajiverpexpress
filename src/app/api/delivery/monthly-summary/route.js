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
    const month = parseInt(searchParams.get("month"));
    const year = parseInt(searchParams.get("year"));
    
    if (!customerId || !month || !year) {
      return NextResponse.json({ success: false, message: "Missing required parameters" }, { status: 400 });
    }
    
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    const deliveries = await Delivery.find({
      "items.customer": customerId,
      deliveryDate: { $gte: startDate, $lte: endDate },
      status: { $nin: ["Cancelled"] }
    })
    .select("deliveryNumber deliveryDate timeSlot deliveryShift grandTotal status isInvoiced")
    .sort({ deliveryDate: 1, deliveryShift: 1 });
    
    const summary = {
      totalDeliveries: deliveries.length,
      totalAmount: deliveries.reduce((sum, d) => sum + (d.grandTotal || 0), 0),
      invoicedAmount: deliveries.filter(d => d.isInvoiced).reduce((sum, d) => sum + (d.grandTotal || 0), 0),
      pendingAmount: deliveries.filter(d => !d.isInvoiced).reduce((sum, d) => sum + (d.grandTotal || 0), 0),
      invoicedCount: deliveries.filter(d => d.isInvoiced).length,
      pendingCount: deliveries.filter(d => !d.isInvoiced).length,
      deliveries: deliveries.map(d => ({
        ...d.toObject(),
        canBeInvoiced: !d.isInvoiced && d.status !== "Cancelled"
      }))
    };
    
    return NextResponse.json({
      success: true,
      data: summary,
      period: { month, year, startDate, endDate }
    });
  } catch (error) {
    console.error("Error fetching monthly summary:", error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}