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
    
    // Get all deliveries
    const deliveries = await Delivery.find({
      deliveryDate: { $gte: startDate, $lte: endDate },
      status: { $nin: ["Cancelled", "Draft"] }
    });
    
    let totalAmount = 0;
    let invoicedAmount = 0;
    let pendingAmount = 0;
    const deliveryDetails = [];
    
    for (const delivery of deliveries) {
      let deliveryCustomerTotal = 0;
      let deliveryInvoicedTotal = 0;
      let deliveryPendingTotal = 0;
      const customerItems = [];
      
      for (const item of delivery.items) {
        const itemCustomerId = item.customer?._id || item.customer;
        
        if (itemCustomerId && itemCustomerId.toString() === customerId) {
          const itemTotal = (item.unitPrice * item.quantity) - (item.discount || 0);
          deliveryCustomerTotal += itemTotal;
          totalAmount += itemTotal;
          
          // Check if this specific item is invoiced
          if (item.isItemInvoiced) {
            deliveryInvoicedTotal += itemTotal;
            invoicedAmount += itemTotal;
          } else {
            deliveryPendingTotal += itemTotal;
            pendingAmount += itemTotal;
          }
          
          customerItems.push({
            itemName: item.itemName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            totalAmount: itemTotal,
            isInvoiced: item.isItemInvoiced
          });
        }
      }
      
      if (customerItems.length > 0) {
        deliveryDetails.push({
          deliveryId: delivery._id,
          deliveryNumber: delivery.deliveryNumber,
          deliveryDate: delivery.deliveryDate,
          customerTotal: deliveryCustomerTotal,
          invoicedTotal: deliveryInvoicedTotal,
          pendingTotal: deliveryPendingTotal,
          isFullyInvoiced: deliveryPendingTotal === 0,
          items: customerItems
        });
      }
    }
    
    const Customer = await import("@/models/CustomerModel").then(m => m.default);
    const customer = await Customer.findById(customerId);
    
    return NextResponse.json({
      success: true,
      data: {
        customer: {
          id: customer?._id,
          name: customer?.customerName || "Unknown",
          code: customer?.customerCode || "N/A"
        },
        period: { month, year },
        summary: {
          totalAmount,
          invoicedAmount,
          pendingAmount,
          totalDeliveries: deliveryDetails.length,
          totalItems: deliveryDetails.reduce((sum, d) => sum + d.items.length, 0)
        },
        deliveries: deliveryDetails
      }
    });
    
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// import { NextResponse } from "next/server";
// import connectDB from "@/lib/db";
// import Delivery from "@/models/Delivery";
// import { getTokenFromHeader, verifyJWT } from "@/lib/auth";

// export async function GET(req) {
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
    
//     const { searchParams } = new URL(req.url);
//     const customerId = searchParams.get("customerId");
//     const month = parseInt(searchParams.get("month"));
//     const year = parseInt(searchParams.get("year"));
    
//     if (!customerId || !month || !year) {
//       return NextResponse.json({ success: false, message: "Missing parameters" }, { status: 400 });
//     }
    
//     const startDate = new Date(year, month - 1, 1);
//     const endDate = new Date(year, month, 0);
    
//     // Get all deliveries for the month
//     const deliveries = await Delivery.find({
//       deliveryDate: { $gte: startDate, $lte: endDate },
//       status: { $nin: ["Cancelled", "Draft"] }
//     }).select("deliveryNumber deliveryDate items isInvoiced invoiceId");
    
//     // Calculate per-customer totals from items, NOT from delivery grandTotal
//     let customerTotal = 0;
//     let customerInvoicedTotal = 0;
//     let customerPendingTotal = 0;
//     const customerDeliveries = [];
    
//     for (const delivery of deliveries) {
//       let deliveryCustomerTotal = 0;
//       let hasCustomerItems = false;
      
//       // Loop through items in this delivery
//       for (const item of delivery.items) {
//         // Check if this item belongs to our customer
//         if (item.customer && (item.customer.toString() === customerId || item.customerName === customerId)) {
//           hasCustomerItems = true;
//           const itemTotal = (item.unitPrice * item.quantity) - (item.discount || 0);
//           deliveryCustomerTotal += itemTotal;
//           customerTotal += itemTotal;
          
//           if (delivery.isInvoiced) {
//             customerInvoicedTotal += itemTotal;
//           } else {
//             customerPendingTotal += itemTotal;
//           }
//         }
//       }
      
//       if (hasCustomerItems) {
//         customerDeliveries.push({
//           deliveryId: delivery._id,
//           deliveryNumber: delivery.deliveryNumber,
//           deliveryDate: delivery.deliveryDate,
//           customerTotal: deliveryCustomerTotal, // ← Sirf is customer ke items ka total
//           isInvoiced: delivery.isInvoiced,
//           invoiceId: delivery.invoiceId
//         });
//       }
//     }
    
//     // Get customer details
//     const Customer = await import("@/models/CustomerModel").then(m => m.default);
//     const customer = await Customer.findById(customerId);
    
//     return NextResponse.json({
//       success: true,
//       data: {
//         customer: {
//           id: customer?._id,
//           name: customer?.customerName,
//           code: customer?.customerCode
//         },
//         period: { month, year },
//         summary: {
//           totalAmount: customerTotal,
//           invoicedAmount: customerInvoicedTotal,
//           pendingAmount: customerPendingTotal,
//           totalDeliveries: customerDeliveries.length,
//           invoicedCount: customerDeliveries.filter(d => d.isInvoiced).length,
//           pendingCount: customerDeliveries.filter(d => !d.isInvoiced).length
//         },
//         deliveries: customerDeliveries
//       }
//     });
    
//   } catch (error) {
//     console.error("Error:", error);
//     return NextResponse.json({ success: false, message: error.message }, { status: 500 });
//   }
// }