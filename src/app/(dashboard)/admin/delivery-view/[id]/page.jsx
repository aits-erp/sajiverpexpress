"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  FaArrowLeft, FaPrint, FaDownload, FaEdit, FaTrash,
  FaUser, FaCalendarAlt, FaBoxOpen, FaRupeeSign,
  FaTruck, FaCheckCircle, FaClock, FaFileInvoice
} from "react-icons/fa";

export default function DeliveryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [delivery, setDelivery] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDelivery();
  }, [params.id]);

  const fetchDelivery = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`/api/delivery/${params.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        setDelivery(res.data.data);
      }
    } catch (error) {
      console.error("Error fetching delivery:", error);
      toast.error("Failed to fetch delivery details");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const getStatusColor = (status) => {
    const colors = {
      Draft: "bg-gray-100 text-gray-700",
      Open: "bg-blue-100 text-blue-700",
      Pending: "bg-yellow-100 text-yellow-700",
      Shipped: "bg-purple-100 text-purple-700",
      Delivered: "bg-green-100 text-green-700",
      Cancelled: "bg-red-100 text-red-700",
      Invoiced: "bg-indigo-100 text-indigo-700"
    };
    return colors[status] || "bg-gray-100 text-gray-700";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!delivery) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Delivery not found</p>
        <button onClick={() => router.back()} className="mt-4 text-indigo-600">Go Back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800"
          >
            <FaArrowLeft /> Back
          </button>
          <div className="flex gap-3">
            <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg text-sm">
              <FaPrint /> Print
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">
              <FaEdit /> Edit
            </button>
          </div>
        </div>

        {/* Delivery Info Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-white">{delivery.deliveryNumber}</h1>
                <p className="text-indigo-200 text-sm mt-1">Delivery Order</p>
              </div>
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(delivery.status)}`}>
                {delivery.status}
              </div>
            </div>
          </div>
          
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-bold text-gray-500 uppercase mb-3">Delivery Information</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <FaCalendarAlt className="text-gray-400" />
                    <span className="text-sm">Delivery Date: {new Date(delivery.deliveryDate).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FaClock className="text-gray-400" />
                    <span className="text-sm">Time Slot: {delivery.timeSlot || `Shift ${delivery.deliveryShift}`}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FaTruck className="text-gray-400" />
                    <span className="text-sm">Expected Delivery: {delivery.expectedDeliveryDate ? new Date(delivery.expectedDeliveryDate).toLocaleDateString() : "N/A"}</span>
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-bold text-gray-500 uppercase mb-3">Reference Info</h3>
                <div className="space-y-2">
                  <p className="text-sm">Reference No: {delivery.refNumber || "N/A"}</p>
                  <p className="text-sm">Sales Employee: {delivery.salesEmployee || "N/A"}</p>
                  <div className="flex items-center gap-2">
                    <FaFileInvoice className="text-gray-400" />
                    <span className="text-sm">Invoice Status: {delivery.isInvoiced ? "Invoiced" : "Pending"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-bold text-gray-800">Items Details</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Item</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Unit Price</th>
                  <th className="px-4 py-3 text-right">Discount</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {delivery.items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{item.itemName}</p>
                        <p className="text-xs text-gray-400">{item.itemCode}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">{item.customerName || "N/A"}</td>
                    <td className="px-4 py-3 text-right">{item.quantity}</td>
                    <td className="px-4 py-3 text-right">₹{item.unitPrice}</td>
                    <td className="px-4 py-3 text-right text-red-500">-₹{item.discount}</td>
                    <td className="px-4 py-3 text-right font-semibold">₹{item.totalAmount}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td colSpan="6" className="px-4 py-3 text-right font-bold">Subtotal:</td>
                  <td className="px-4 py-3 text-right font-bold">₹{delivery.totalBeforeDiscount}</td>
                </tr>
                <tr>
                  <td colSpan="6" className="px-4 py-3 text-right font-bold">GST Total:</td>
                  <td className="px-4 py-3 text-right font-bold">₹{delivery.gstTotal}</td>
                </tr>
                <tr>
                  <td colSpan="6" className="px-4 py-3 text-right font-bold">Freight:</td>
                  <td className="px-4 py-3 text-right font-bold">₹{delivery.freight}</td>
                </tr>
                <tr className="bg-indigo-50">
                  <td colSpan="6" className="px-4 py-3 text-right font-bold text-indigo-700 text-lg">Grand Total:</td>
                  <td className="px-4 py-3 text-right font-bold text-indigo-700 text-lg">₹{delivery.grandTotal}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Customer-wise Summary for this delivery */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-bold text-gray-800">Customer-wise Summary</h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {(() => {
                const customerGroups = {};
                delivery.items.forEach(item => {
                  const key = item.customer || item.customerName;
                  if (!customerGroups[key]) {
                    customerGroups[key] = {
                      name: item.customerName,
                      items: [],
                      total: 0
                    };
                  }
                  customerGroups[key].items.push(item);
                  customerGroups[key].total += item.totalAmount;
                });
                
                return Object.values(customerGroups).map((group, idx) => (
                  <div key={idx} className="border rounded-lg p-4">
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex items-center gap-2">
                        <FaUser className="text-indigo-600" />
                        <h3 className="font-bold text-gray-800">{group.name}</h3>
                      </div>
                      <p className="font-bold text-indigo-600">₹{group.total.toLocaleString()}</p>
                    </div>
                    <div className="space-y-2">
                      {group.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span>{item.itemName} x {item.quantity}</span>
                          <span>₹{item.totalAmount}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      </div>
      <ToastContainer />
    </div>
  );
}