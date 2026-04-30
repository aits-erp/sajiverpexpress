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
    const month = parseInt(searchParams.get("month"));
    const year = parseInt(searchParams.get("year"));
    
    if (!month || !year) {
      return NextResponse.json({ success: false, message: "Month and year are required" }, { status: 400 });
    }
    
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    // Get all deliveries for the month
    const deliveries = await Delivery.find({
      deliveryDate: { $gte: startDate, $lte: endDate },
      status: { $nin: ["Cancelled", "Draft"] }
    })
    .populate("items.customer", "customerName customerCode")
    .select("deliveryNumber deliveryDate grandTotal isInvoiced items");
    
    // Group by customer
    const customerSummary = {};
    
    for (const delivery of deliveries) {
      for (const item of delivery.items) {
        const customer = item.customer;
        if (!customer) continue;
        
        const customerId = customer._id || customer;
        
        if (!customerSummary[customerId]) {
          customerSummary[customerId] = {
            customerId: customerId,
            customerName: customer.customerName || "Unknown",
            customerCode: customer.customerCode || "",
            totalDeliveries: 0,
            totalAmount: 0,
            invoicedAmount: 0,
            pendingAmount: 0,
            deliveries: [],
            isInvoiced: false
          };
        }
        
        customerSummary[customerId].totalDeliveries++;
        customerSummary[customerId].totalAmount += delivery.grandTotal || 0;
        
        if (delivery.isInvoiced) {
          customerSummary[customerId].invoicedAmount += delivery.grandTotal || 0;
        } else {
          customerSummary[customerId].pendingAmount += delivery.grandTotal || 0;
        }
        
        if (!customerSummary[customerId].deliveries.find(d => d._id === delivery._id)) {
          customerSummary[customerId].deliveries.push({
            _id: delivery._id,
            deliveryNumber: delivery.deliveryNumber,
            deliveryDate: delivery.deliveryDate,
            grandTotal: delivery.grandTotal,
            isInvoiced: delivery.isInvoiced
          });
        }
        
        customerSummary[customerId].isInvoiced = customerSummary[customerId].invoicedAmount > 0 && 
          customerSummary[customerId].pendingAmount === 0;
      }
    }
    
    const summary = {
      period: { month, year, startDate, endDate },
      totalCustomers: Object.keys(customerSummary).length,
      totalDeliveries: deliveries.length,
      totalAmount: deliveries.reduce((sum, d) => sum + (d.grandTotal || 0), 0),
      invoicedAmount: deliveries.filter(d => d.isInvoiced).reduce((sum, d) => sum + (d.grandTotal || 0), 0),
      pendingAmount: deliveries.filter(d => !d.isInvoiced).reduce((sum, d) => sum + (d.grandTotal || 0), 0),
      customers: Object.values(customerSummary)
    };
    
    return NextResponse.json({
      success: true,
      data: summary
    });
    
  } catch (error) {
    console.error("Error fetching monthly summary:", error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}