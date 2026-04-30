import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Delivery from "@/models/Delivery";
import Invoice from "@/models/Invoice";
import Customer from "@/models/CustomerModel";
import { verifyToken } from "@/lib/auth";

export async function POST(req) {
  try {
    await connectDB();
    
    const token = req.headers.get("authorization")?.split(" ")[1];
    if (!token) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ success: false, message: "Invalid token" }, { status: 401 });
    }
    
    const { customerId, month, year, deliveryIds } = await req.json();
    
    let deliveries = [];
    let customer = null;
    
    if (deliveryIds && deliveryIds.length > 0) {
      // Generate invoice for selected deliveries
      deliveries = await Delivery.find({
        _id: { $in: deliveryIds },
        isInvoiced: false,
        status: { $nin: ["Cancelled", "Draft"] }
      }).populate("items.item");
      
      if (deliveries.length > 0) {
        customer = await Customer.findById(deliveries[0].items[0].customer);
      }
    } else {
      // Generate invoice for monthly deliveries
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      
      deliveries = await Delivery.find({
        "items.customer": customerId,
        deliveryDate: { $gte: startDate, $lte: endDate },
        isInvoiced: false,
        status: { $nin: ["Cancelled", "Draft"] }
      }).populate("items.item");
      
      customer = await Customer.findById(customerId);
    }
    
    if (!customer) {
      return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 });
    }
    
    if (deliveries.length === 0) {
      return NextResponse.json({ 
        success: false, 
        message: "No un-invoiced deliveries found for the selected period" 
      }, { status: 400 });
    }
    
    // Calculate totals
    let subtotal = 0;
    let gstTotal = 0;
    let freightTotal = 0;
    const invoiceItems = [];
    
    for (const delivery of deliveries) {
      freightTotal += delivery.freight || 0;
      
      for (const item of delivery.items) {
        const itemTotal = (item.unitPrice * item.quantity) - (item.discount || 0);
        subtotal += itemTotal;
        gstTotal += item.gstAmount || 0;
        
        invoiceItems.push({
          deliveryId: delivery._id,
          deliveryNumber: delivery.deliveryNumber,
          deliveryDate: delivery.deliveryDate,
          item: item.item,
          itemCode: item.itemCode,
          itemName: item.itemName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          totalAmount: item.totalAmount,
          gstAmount: item.gstAmount,
          gstRate: item.gstRate
        });
      }
    }
    
    const grandTotal = subtotal + gstTotal + freightTotal;
    
    const invoice = new Invoice({
      customer: customer._id,
      customerCode: customer.customerCode,
      customerName: customer.customerName,
      customerBillingAddress: customer.billingAddress,
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days due
      period: {
        month: month,
        year: year,
        fromDate: new Date(year, month - 1, 1),
        toDate: new Date(year, month, 0)
      },
      deliveries: deliveries.map(d => d._id),
      items: invoiceItems,
      subtotal,
      gstTotal,
      freightTotal,
      grandTotal,
      status: "Generated",
      generatedBy: decoded.userId
    });
    
    await invoice.save();
    
    // Mark deliveries as invoiced
    await Delivery.updateMany(
      { _id: { $in: deliveries.map(d => d._id) } },
      { 
        $set: { 
          isInvoiced: true, 
          invoiceId: invoice._id,
          invoicedAt: new Date(),
          status: "Invoiced"
        } 
      }
    );
    
    return NextResponse.json({
      success: true,
      data: invoice,
      message: `Invoice generated for ${deliveries.length} deliveries`,
      summary: {
        totalDeliveries: deliveries.length,
        totalItems: invoiceItems.length,
        grandTotal
      }
    });
  } catch (error) {
    console.error("Error generating invoice:", error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}