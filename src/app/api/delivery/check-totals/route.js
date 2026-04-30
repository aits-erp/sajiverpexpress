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
      return NextResponse.json({ success: false, message: "Missing parameters" }, { status: 400 });
    }
    
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    const deliveries = await Delivery.find({
      "items.customer": customerId,
      deliveryDate: { $gte: startDate, $lte: endDate },
      status: { $nin: ["Cancelled"] }
    }).select("deliveryNumber deliveryDate totalBeforeDiscount gstTotal freight grandTotal isInvoiced");
    
    const summary = {
      totalDeliveries: deliveries.length,
      deliveries: deliveries.map(d => ({
        number: d.deliveryNumber,
        date: d.deliveryDate,
        subtotal: d.totalBeforeDiscount,
        gst: d.gstTotal,
        freight: d.freight,
        grandTotal: d.grandTotal,
        isInvoiced: d.isInvoiced
      })),
      totals: {
        subtotal: deliveries.reduce((sum, d) => sum + (d.totalBeforeDiscount || 0), 0),
        gst: deliveries.reduce((sum, d) => sum + (d.gstTotal || 0), 0),
        freight: deliveries.reduce((sum, d) => sum + (d.freight || 0), 0),
        grandTotal: deliveries.reduce((sum, d) => sum + (d.grandTotal || 0), 0)
      }
    };
    
    return NextResponse.json({ success: true, data: summary });
    
  } catch (error) {
    console.error("Error checking totals:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}