import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Delivery from "@/models/Delivery";
import Invoice from "@/models/Invoice";
import Customer from "@/models/CustomerModel";
import { getTokenFromHeader, verifyJWT } from "@/lib/auth";

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
    
    const { month, year, customerIds } = await req.json();
    
    if (!month || !year) {
      return NextResponse.json({ success: false, message: "Month and year are required" }, { status: 400 });
    }
    
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    // Build query
    let query = {
      deliveryDate: { $gte: startDate, $lte: endDate },
      isInvoiced: false,
      status: { $nin: ["Cancelled", "Draft"] }
    };
    
    if (customerIds && customerIds.length > 0) {
      query["items.customer"] = { $in: customerIds };
    }
    
    const deliveries = await Delivery.find(query)
      .populate("items.item")
      .populate("items.customer");
    
    if (deliveries.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No un-invoiced deliveries found for the selected period"
      }, { status: 400 });
    }
    
    // Group deliveries by customer
    const customerDeliveries = {};
    const batchId = `BATCH-${Date.now()}`;
    const generatedInvoices = [];
    
    for (const delivery of deliveries) {
      // Get customer from the first item (or any item)
      const firstItem = delivery.items[0];
      if (!firstItem || !firstItem.customer) continue;
      
      const customerId = firstItem.customer._id || firstItem.customer;
      const customerData = await Customer.findById(customerId);
      
      if (!customerDeliveries[customerId]) {
        customerDeliveries[customerId] = {
          customerId,
          customerName: firstItem.customerName,
          customerCode: firstItem.customerCode,
          customerData: customerData,
          deliveries: [],
          deliveryIds: [],
          items: [],
          subtotal: 0,
          gstTotal: 0,
          freightTotal: 0,
          grandTotal: 0, // Add grand total field
          deliveryCount: 0
        };
      }
      
      // Add delivery
      if (!customerDeliveries[customerId].deliveryIds.includes(delivery._id)) {
        customerDeliveries[customerId].deliveryIds.push(delivery._id);
        customerDeliveries[customerId].deliveries.push(delivery);
        customerDeliveries[customerId].deliveryCount++;
        
        // Add delivery totals
        customerDeliveries[customerId].subtotal += delivery.totalBeforeDiscount || 0;
        customerDeliveries[customerId].gstTotal += delivery.gstTotal || 0;
        customerDeliveries[customerId].freightTotal += delivery.freight || 0;
        customerDeliveries[customerId].grandTotal += delivery.grandTotal || 0; // CRITICAL: Add delivery grand total
      }
      
      // Add items
      for (const item of delivery.items) {
        customerDeliveries[customerId].items.push({
          deliveryId: delivery._id,
          deliveryNumber: delivery.deliveryNumber,
          deliveryDate: delivery.deliveryDate,
          itemId: item.item,
          itemCode: item.itemCode,
          itemName: item.itemName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount || 0,
          totalAmount: item.totalAmount,
          gstAmount: item.gstAmount || 0,
          gstRate: item.gstRate,
          freight: item.freight || 0,
          deliveryGrandTotal: delivery.grandTotal
        });
      }
    }
    
    // Generate invoice for each customer
    for (const [custId, data] of Object.entries(customerDeliveries)) {
      const invoice = new Invoice({
        customerId: custId,
        customerCode: data.customerCode,
        customerName: data.customerName,
        customerGST: data.customerData?.gstNumber,
        customerAddress: data.customerData?.billingAddress,
        period: { month, year, fromDate: startDate, toDate: endDate },
        deliveries: data.deliveryIds,
        deliveryCount: data.deliveryCount,
        items: data.items,
        totalItems: data.items.length,
        subtotal: data.subtotal,
        gstTotal: data.gstTotal,
        freightTotal: data.freightTotal,
        grandTotal: data.grandTotal, // This is sum of all delivery grand totals
        invoiceDate: new Date(),
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        status: "Generated",
        generatedBy: decoded.userId,
        batchId: batchId
      });
      
      await invoice.save();
      
      // Mark deliveries as invoiced
      await Delivery.updateMany(
        { _id: { $in: data.deliveryIds } },
        { 
          $set: { 
            isInvoiced: true, 
            invoiceId: invoice._id,
            invoicedAt: new Date(),
            invoiceMonth: month,
            invoiceYear: year
          } 
        }
      );
      
      generatedInvoices.push({
        id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
        amount: invoice.grandTotal,
        deliveryCount: data.deliveryCount
      });
    }
    
    return NextResponse.json({
      success: true,
      message: `Generated ${generatedInvoices.length} invoices for ${Object.keys(customerDeliveries).length} customers`,
      data: {
        totalInvoices: generatedInvoices.length,
        totalCustomers: Object.keys(customerDeliveries).length,
        totalDeliveries: deliveries.length,
        totalAmount: generatedInvoices.reduce((sum, inv) => sum + inv.amount, 0),
        invoices: generatedInvoices,
        batchId: batchId
      }
    });
    
  } catch (error) {
    console.error("Error generating bulk invoices:", error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}