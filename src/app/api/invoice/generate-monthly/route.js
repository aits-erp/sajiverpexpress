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
    
    const { customerId, month, year, deliveryIds } = await req.json();
    
    if (!customerId || !month || !year) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }
    
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    // Get deliveries
    let query = {
      deliveryDate: { $gte: startDate, $lte: endDate },
      status: { $nin: ["Cancelled", "Draft"] }
    };
    
    if (deliveryIds && deliveryIds.length > 0) {
      query._id = { $in: deliveryIds };
    }
    
    const deliveries = await Delivery.find(query);
    
    if (deliveries.length === 0) {
      return NextResponse.json({ 
        success: false, 
        message: "No deliveries found" 
      }, { status: 400 });
    }
    
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 });
    }
    
    // Collect items to invoice (only those not already invoiced)
    let subtotal = 0;
    let gstTotal = 0;
    let freightTotal = 0;
    let grandTotal = 0;
    const invoiceItems = [];
    const deliveryIdsList = [];
    const updatedItems = []; // Track which items to mark as invoiced
    
    for (const delivery of deliveries) {
      let deliveryHasItems = false;
      
      for (let i = 0; i < delivery.items.length; i++) {
        const item = delivery.items[i];
        const itemCustomerId = item.customer?._id || item.customer;
        
        // Check if item belongs to customer AND not yet invoiced
        if (itemCustomerId && itemCustomerId.toString() === customerId && !item.isItemInvoiced) {
          deliveryHasItems = true;
          
          const itemTotal = (item.unitPrice * item.quantity) - (item.discount || 0);
          const itemGst = item.gstAmount || 0;
          const itemFreight = item.freight || 0;
          
          subtotal += itemTotal;
          gstTotal += itemGst;
          freightTotal += itemFreight;
          grandTotal += itemTotal + itemGst + itemFreight;
          
          invoiceItems.push({
            deliveryId: delivery._id,
            deliveryNumber: delivery.deliveryNumber,
            deliveryDate: delivery.deliveryDate,
            itemIndex: i, // Store index to update later
            itemId: item.item?._id || item.item,
            itemCode: item.itemCode,
            itemName: item.itemName,
            itemDescription: item.itemDescription,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount || 0,
            totalAmount: itemTotal,
            gstAmount: itemGst,
            gstRate: item.gstRate,
            freight: itemFreight
          });
          
          // Store reference to update this item
          updatedItems.push({
            deliveryId: delivery._id,
            itemIndex: i
          });
          
          if (!deliveryIdsList.includes(delivery._id.toString())) {
            deliveryIdsList.push(delivery._id);
          }
        }
      }
    }
    
    if (invoiceItems.length === 0) {
      return NextResponse.json({ 
        success: false, 
        message: `No pending items found for customer ${customer.customerName}` 
      }, { status: 400 });
    }
    
    // Create invoice
    const invoice = new Invoice({
      customerId: customer._id,
      customerCode: customer.customerCode,
      customerName: customer.customerName,
      customerGST: customer.gstNumber,
      customerAddress: customer.billingAddress,
      period: { month, year, fromDate: startDate, toDate: endDate },
      deliveries: deliveryIdsList,
      deliveryCount: deliveryIdsList.length,
      items: invoiceItems,
      totalItems: invoiceItems.length,
      subtotal: subtotal,
      gstTotal: gstTotal,
      freightTotal: freightTotal,
      grandTotal: grandTotal,
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      status: "Generated",
      generatedBy: decoded.userId,
      batchId: `INV-${Date.now()}`
    });
    
    await invoice.save();
    
    // Update each item as invoiced
    for (const update of updatedItems) {
      await Delivery.updateOne(
        { _id: update.deliveryId },
        { 
          $set: { 
            [`items.${update.itemIndex}.isItemInvoiced`]: true,
            [`items.${update.itemIndex}.itemInvoiceId`]: invoice._id,
            [`items.${update.itemIndex}.itemInvoicedAt`]: new Date()
          } 
        }
      );
    }
    
    // Update delivery status if all items are invoiced
    for (const deliveryId of deliveryIdsList) {
      const delivery = await Delivery.findById(deliveryId);
      const allItemsInvoiced = delivery.items.every(item => item.isItemInvoiced);
      const hasAnyInvoiced = delivery.items.some(item => item.isItemInvoiced);
      
      if (allItemsInvoiced) {
        await Delivery.findByIdAndUpdate(deliveryId, { 
          status: "FullyInvoiced",
          isInvoiced: true,
          invoiceId: invoice._id,
          invoicedAt: new Date()
        });
      } else if (hasAnyInvoiced) {
        await Delivery.findByIdAndUpdate(deliveryId, { 
          status: "PartiallyInvoiced" 
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Invoice generated successfully! ${invoiceItems.length} items invoiced for ${customer.customerName}`,
      data: {
        invoice: {
          _id: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          customerName: invoice.customerName,
          invoiceDate: invoice.invoiceDate,
          dueDate: invoice.dueDate,
          subtotal: invoice.subtotal,
          gstTotal: invoice.gstTotal,
          freightTotal: invoice.freightTotal,
          grandTotal: invoice.grandTotal,
          items: invoice.items,
          deliveryCount: invoice.deliveryCount
        },
        summary: {
          totalItems: invoiceItems.length,
          totalDeliveries: deliveryIdsList.length,
          grandTotal: grandTotal
        }
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


// import { NextResponse } from "next/server";
// import connectDB from "@/lib/db";
// import Delivery from "@/models/Delivery";
// import Invoice from "@/models/Invoice";
// import Customer from "@/models/CustomerModel";
// import { getTokenFromHeader, verifyJWT } from "@/lib/auth";

// export async function POST(req) {
//   try {
//     await connectDB();
    
//     const token = getTokenFromHeader(req);
//     if (!token) {
//       return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
//     }
    
//     const decoded = verifyJWT(token);
//     if (!decoded) {
//       return NextResponse.json({ success: false, message: "Invalid token" }, { status: 401 });
//     }
    
//     const { customerId, month, year, deliveryIds } = await req.json();
    
//     if (!customerId || !month || !year) {
//       return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
//     }
    
//     const startDate = new Date(year, month - 1, 1);
//     const endDate = new Date(year, month, 0);
    
//     // Build query for deliveries
//     let query = {
//       deliveryDate: { $gte: startDate, $lte: endDate },
//       isInvoiced: false,
//       status: { $nin: ["Cancelled", "Draft"] }
//     };
    
//     if (deliveryIds && deliveryIds.length > 0) {
//       query._id = { $in: deliveryIds };
//     }
    
//     const deliveries = await Delivery.find(query)
//       .populate("items.item")
//       .populate("items.customer");
    
//     if (deliveries.length === 0) {
//       return NextResponse.json({ 
//         success: false, 
//         message: "No pending deliveries found" 
//       }, { status: 400 });
//     }
    
//     // Get customer details
//     const customer = await Customer.findById(customerId);
//     if (!customer) {
//       return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 });
//     }
    
//     // Calculate totals from items belonging to this customer ONLY
//     let customerSubtotal = 0;
//     let customerGstTotal = 0;
//     let customerFreightTotal = 0;
//     let customerGrandTotal = 0;
//     const invoiceItems = [];
//     const deliveryIdsList = [];
//     const deliveryBreakdown = [];
    
//     for (const delivery of deliveries) {
//       let deliveryCustomerTotal = 0;
//       let deliveryHasItems = false;
//       const customerItemsInThisDelivery = [];
      
//       // Loop through items and pick only those belonging to this customer
//       for (const item of delivery.items) {
//         const itemCustomerId = item.customer?._id || item.customer;
        
//         if (itemCustomerId && itemCustomerId.toString() === customerId) {
//           deliveryHasItems = true;
          
//           const itemTotal = (item.unitPrice * item.quantity) - (item.discount || 0);
//           const itemGst = item.gstAmount || 0;
//           const itemFreight = item.freight || 0;
          
//           deliveryCustomerTotal += itemTotal;
//           customerSubtotal += itemTotal;
//           customerGstTotal += itemGst;
//           customerFreightTotal += itemFreight;
          
//           customerItemsInThisDelivery.push({
//             itemId: item.item?._id || item.item,
//             itemCode: item.itemCode,
//             itemName: item.itemName,
//             quantity: item.quantity,
//             unitPrice: item.unitPrice,
//             discount: item.discount || 0,
//             totalAmount: itemTotal,
//             gstAmount: itemGst,
//             gstRate: item.gstRate,
//             freight: itemFreight
//           });
//         }
//       }
      
//       if (deliveryHasItems) {
//         deliveryIdsList.push(delivery._id);
//         customerGrandTotal += deliveryCustomerTotal;
        
//         deliveryBreakdown.push({
//           deliveryId: delivery._id,
//           deliveryNumber: delivery.deliveryNumber,
//           deliveryDate: delivery.deliveryDate,
//           customerTotal: deliveryCustomerTotal
//         });
        
//         // Add items to invoice
//         for (const item of customerItemsInThisDelivery) {
//           invoiceItems.push({
//             deliveryId: delivery._id,
//             deliveryNumber: delivery.deliveryNumber,
//             deliveryDate: delivery.deliveryDate,
//             ...item
//           });
//         }
//       }
//     }
    
//     if (deliveryIdsList.length === 0) {
//       return NextResponse.json({ 
//         success: false, 
//         message: `No items found for customer ${customer.customerName} in the selected period` 
//       }, { status: 400 });
//     }
    
//     console.log(`Customer ${customer.customerName}:`);
//     console.log(`  - Subtotal: ₹${customerSubtotal}`);
//     console.log(`  - GST: ₹${customerGstTotal}`);
//     console.log(`  - Freight: ₹${customerFreightTotal}`);
//     console.log(`  - Grand Total: ₹${customerGrandTotal}`);
//     console.log(`  - Deliveries: ${deliveryIdsList.length}`);
    
//     // Create invoice for this customer ONLY
//     const invoice = new Invoice({
//       customerId: customer._id,
//       customerCode: customer.customerCode,
//       customerName: customer.customerName,
//       customerGST: customer.gstNumber,
//       customerAddress: customer.billingAddress,
//       period: { month, year, fromDate: startDate, toDate: endDate },
//       deliveries: deliveryIdsList,
//       deliveryCount: deliveryIdsList.length,
//       items: invoiceItems,
//       totalItems: invoiceItems.length,
//       subtotal: customerSubtotal,
//       gstTotal: customerGstTotal,
//       freightTotal: customerFreightTotal,
//       grandTotal: customerGrandTotal, // ← Sirf is customer ke items ka total
//       invoiceDate: new Date(),
//       dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
//       status: "Generated",
//       generatedBy: decoded.userId,
//       batchId: `SINGLE-${Date.now()}`
//     });
    
//     await invoice.save();
    
//     // Mark deliveries as invoiced ONLY if ALL items in delivery are invoiced?
//     // For now, we don't mark delivery as invoiced because other customers might have pending items
//     // Instead, we track per-item invoicing through the invoice items
    
//     // Note: Since a delivery can have multiple customers,
//     // we should NOT mark the entire delivery as invoiced.
//     // Only the items belonging to this customer are invoiced.
    
//     return NextResponse.json({
//       success: true,
//       message: `Invoice generated for customer ${customer.customerName}. Total: ₹${customerGrandTotal.toLocaleString()}`,
//       data: {
//         invoice,
//         summary: {
//           customerName: customer.customerName,
//           totalDeliveries: deliveryIdsList.length,
//           totalItems: invoiceItems.length,
//           subtotal: customerSubtotal,
//           gstTotal: customerGstTotal,
//           freightTotal: customerFreightTotal,
//           grandTotal: customerGrandTotal
//         },
//         deliveryBreakdown
//       }
//     });
    
//   } catch (error) {
//     console.error("Error generating invoice:", error);
//     return NextResponse.json(
//       { success: false, message: error.message },
//       { status: 500 }
//     );
//   }
// }