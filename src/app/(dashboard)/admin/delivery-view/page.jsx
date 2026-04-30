"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { jwtDecode } from "jwt-decode";
import {
  FaPlus, FaEdit, FaEye, FaTrash, FaSearch, FaFilter,
  FaFileInvoice, FaDownload, FaPrint, FaCalendarAlt,
  FaUser, FaBoxOpen, FaRupeeSign, FaTimes, FaCheckCircle,
  FaClock, FaTruck, FaCheck, FaBan
} from "react-icons/fa";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import MonthlyInvoiceGenerator from "@/components/MonthlyInvoiceGenerator";

export default function DeliveryViewPage() {
  const router = useRouter();
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedCustomer, setSelectedCustomer] = useState("all");
  const [customers, setCustomers] = useState([]);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedDeliveries, setSelectedDeliveries] = useState([]);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [invoiceCustomer, setInvoiceCustomer] = useState("");
  const [monthlyData, setMonthlyData] = useState(null);
  const [stats, setStats] = useState({
    total: 0,
    totalAmount: 0,
    pendingInvoiced: 0,
    completedDeliveries: 0
  });
  
  // Active tab state
  const [activeTab, setActiveTab] = useState("deliveries");

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  useEffect(() => {
    fetchDeliveries();
    fetchCustomers();
  }, []);

  const fetchDeliveries = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }

      const res = await axios.get("/api/delivery", {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        setDeliveries(res.data.data);
        calculateStats(res.data.data);
      }
    } catch (error) {
      console.error("Error fetching deliveries:", error);
      toast.error("Failed to fetch deliveries");
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("/api/customers", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        setCustomers(res.data.data);
      }
    } catch (error) {
      console.error("Error fetching customers:", error);
    }
  };

  const calculateStats = (data) => {
    const total = data.length;
    const totalAmount = data.reduce((sum, d) => sum + (d.grandTotal || 0), 0);
    const pendingInvoiced = data.filter(d => !d.isInvoiced).length;
    const completedDeliveries = data.filter(d => d.status === "Delivered").length;
    
    setStats({ total, totalAmount, pendingInvoiced, completedDeliveries });
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this delivery?")) return;
    
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`/api/delivery/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Delivery deleted successfully");
      fetchDeliveries();
    } catch (error) {
      toast.error("Failed to delete delivery");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedDeliveries.length === 0) {
      toast.error("Please select deliveries to delete");
      return;
    }
    
    if (!confirm(`Delete ${selectedDeliveries.length} deliveries?`)) return;
    
    try {
      const token = localStorage.getItem("token");
      await Promise.all(
        selectedDeliveries.map(id => 
          axios.delete(`/api/delivery/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        )
      );
      toast.success(`${selectedDeliveries.length} deliveries deleted`);
      setSelectedDeliveries([]);
      fetchDeliveries();
    } catch (error) {
      toast.error("Failed to delete some deliveries");
    }
  };

  const generateMonthlyInvoice = async () => {
    if (!invoiceCustomer) {
      toast.error("Please select a customer");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await axios.post("/api/invoice/generate-monthly", {
        customerId: invoiceCustomer,
        month: selectedMonth,
        year: selectedYear,
        deliveryIds: selectedDeliveries.length > 0 ? selectedDeliveries : undefined
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        toast.success(res.data.message);
        setShowInvoiceModal(false);
        setSelectedDeliveries([]);
        fetchDeliveries();
        
        if (confirm("Invoice generated successfully! Do you want to download it?")) {
          downloadInvoice(res.data.data);
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to generate invoice");
    }
  };

  const downloadInvoice = (invoice) => {
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text("INVOICE", 105, 20, { align: "center" });
    
    doc.setFontSize(10);
    doc.text(`Invoice No: ${invoice.invoiceNumber}`, 20, 40);
    doc.text(`Date: ${new Date(invoice.invoiceDate).toLocaleDateString()}`, 20, 50);
    doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`, 20, 60);
    
    doc.text(`Customer: ${invoice.customerName}`, 120, 40);
    doc.text(`Period: ${months[invoice.period.month - 1]} ${invoice.period.year}`, 120, 50);
    
    const tableData = invoice.items.map((item, idx) => [
      idx + 1,
      item.itemName,
      item.quantity,
      `₹${item.unitPrice}`,
      `₹${item.discount || 0}`,
      `₹${item.totalAmount}`
    ]);
    
    doc.autoTable({
      startY: 70,
      head: [["#", "Item", "Qty", "Unit Price", "Discount", "Total"]],
      body: tableData,
    });
    
    let finalY = doc.lastAutoTable.finalY + 10;
    doc.text(`Subtotal: ₹${invoice.subtotal}`, 140, finalY);
    doc.text(`GST: ₹${invoice.gstTotal}`, 140, finalY + 10);
    doc.text(`Freight: ₹${invoice.freightTotal}`, 140, finalY + 20);
    doc.setFontSize(14);
    doc.text(`Grand Total: ₹${invoice.grandTotal}`, 140, finalY + 35);
    
    doc.save(`Invoice_${invoice.invoiceNumber}.pdf`);
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

  const getStatusIcon = (status) => {
    const icons = {
      Draft: <FaEdit className="text-xs" />,
      Open: <FaBoxOpen className="text-xs" />,
      Pending: <FaClock className="text-xs" />,
      Shipped: <FaTruck className="text-xs" />,
      Delivered: <FaCheckCircle className="text-xs" />,
      Cancelled: <FaBan className="text-xs" />,
      Invoiced: <FaFileInvoice className="text-xs" />
    };
    return icons[status] || <FaBoxOpen className="text-xs" />;
  };

  const filteredDeliveries = deliveries.filter(delivery => {
    const matchesSearch = 
      delivery.deliveryNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      delivery.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      delivery.items?.some(item => item.itemName?.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = selectedStatus === "all" || delivery.status === selectedStatus;
    
    const matchesCustomer = selectedCustomer === "all" || 
      delivery.items?.some(item => item.customer?._id === selectedCustomer || item.customer === selectedCustomer);
    
    let matchesDate = true;
    if (dateRange.start && dateRange.end) {
      const deliveryDate = new Date(delivery.deliveryDate);
      const start = new Date(dateRange.start);
      const end = new Date(dateRange.end);
      matchesDate = deliveryDate >= start && deliveryDate <= end;
    }
    
    return matchesSearch && matchesStatus && matchesCustomer && matchesDate;
  });

  const getMonthlySummary = async () => {
    if (!invoiceCustomer) {
      toast.error("Please select a customer first");
      return;
    }
    
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("/api/delivery/monthly-summary", {
        params: {
          customerId: invoiceCustomer,
          month: selectedMonth,
          year: selectedYear
        },
        headers: { Authorization: `Bearer ${token}` }
      });
      setMonthlyData(res.data.data);
    } catch (error) {
      toast.error("Failed to fetch monthly summary");
    }
  };

  useEffect(() => {
    if (invoiceCustomer && showInvoiceModal) {
      getMonthlySummary();
    }
  }, [invoiceCustomer, selectedMonth, selectedYear, showInvoiceModal]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading deliveries...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">Delivery Management</h1>
            <p className="text-sm text-gray-500 mt-1">Manage and track all deliveries</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.push("/admin/delivery-view/new")}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
            >
              <FaPlus /> New Delivery
            </button>
            {activeTab === "deliveries" && (
              <button
                onClick={() => setShowInvoiceModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors"
              >
                <FaFileInvoice /> Generate Invoice
              </button>
            )}
            {selectedDeliveries.length > 0 && activeTab === "deliveries" && (
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors"
              >
                <FaTrash /> Delete ({selectedDeliveries.length})
              </button>
            )}
          </div>
        </div>

        {/* Stats Cards - Show only on deliveries tab */}
        {activeTab === "deliveries" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Total Deliveries</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <FaBoxOpen className="text-indigo-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Total Amount</p>
                  <p className="text-2xl font-bold text-green-600">₹{stats.totalAmount.toLocaleString()}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <FaRupeeSign className="text-green-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Pending Invoicing</p>
                  <p className="text-2xl font-bold text-yellow-600">{stats.pendingInvoiced}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                  <FaFileInvoice className="text-yellow-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Delivered</p>
                  <p className="text-2xl font-bold text-green-600">{stats.completedDeliveries}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <FaCheckCircle className="text-green-600" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex gap-6">
              <button
                onClick={() => setActiveTab("deliveries")}
                className={`pb-3 px-1 text-sm font-medium transition-colors ${
                  activeTab === "deliveries"
                    ? "border-b-2 border-indigo-500 text-indigo-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                All Deliveries
              </button>
              <button
                onClick={() => setActiveTab("invoices")}
                className={`pb-3 px-1 text-sm font-medium transition-colors ${
                  activeTab === "invoices"
                    ? "border-b-2 border-indigo-500 text-indigo-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Monthly Invoice Generator
              </button>
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === "deliveries" ? (
          <>
            {/* Filters Bar */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                    <input
                      type="text"
                      placeholder="Search by delivery #, customer, item..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                    />
                  </div>
                </div>
                
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-indigo-500 outline-none"
                >
                  <option value="all">All Status</option>
                  <option value="Draft">Draft</option>
                  <option value="Open">Open</option>
                  <option value="Pending">Pending</option>
                  <option value="Shipped">Shipped</option>
                  <option value="Delivered">Delivered</option>
                  <option value="Cancelled">Cancelled</option>
                  <option value="Invoiced">Invoiced</option>
                </select>
                
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                >
                  <FaFilter /> Filters
                </button>
              </div>
              
              {showFilters && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-200">
                  <select
                    value={selectedCustomer}
                    onChange={(e) => setSelectedCustomer(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="all">All Customers</option>
                    {customers.map(customer => (
                      <option key={customer._id} value={customer._id}>
                        {customer.customerName}
                      </option>
                    ))}
                  </select>
                  
                  <input
                    type="date"
                    placeholder="Start Date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  
                  <input
                    type="date"
                    placeholder="End Date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              )}
            </div>

            {/* Deliveries Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={selectedDeliveries.length === filteredDeliveries.length && filteredDeliveries.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDeliveries(filteredDeliveries.map(d => d._id));
                            } else {
                              setSelectedDeliveries([]);
                            }
                          }}
                          className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Delivery #</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Time Slot</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Items</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Amount</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Invoice</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredDeliveries.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                          No deliveries found
                        </td>
                      </tr>
                    ) : (
                      filteredDeliveries.map((delivery) => (
                        <tr key={delivery._id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedDeliveries.includes(delivery._id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedDeliveries([...selectedDeliveries, delivery._id]);
                                } else {
                                  setSelectedDeliveries(selectedDeliveries.filter(id => id !== delivery._id));
                                }
                              }}
                              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600">
                            {delivery.deliveryNumber}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {new Date(delivery.deliveryDate).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 bg-gray-100 rounded-full text-xs">
                              {delivery.timeSlot || `Shift ${delivery.deliveryShift}`}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <FaUser className="text-gray-400 text-xs" />
                              <span className="text-sm">{delivery.customerName || "N/A"}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <FaBoxOpen className="text-gray-400 text-xs" />
                              <span className="text-sm">{delivery.items?.length || 0} items</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                            ₹{(delivery.grandTotal || 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(delivery.status)}`}>
                              {getStatusIcon(delivery.status)} {delivery.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {delivery.isInvoiced ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                                <FaCheckCircle className="text-xs" /> Yes
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">
                                <FaClock className="text-xs" /> No
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => router.push(`/admin/delivery-view/new?editId=${delivery._id}`)}
                                className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-colors"
                                title="Edit"
                              >
                                <FaEdit className="text-xs" />
                              </button>
                              <button
                                onClick={() => router.push(`/admin/delivery-view/${delivery._id}`)}
                                className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-colors"
                                title="View"
                              >
                                <FaEye className="text-xs" />
                              </button>
                              <button
                                onClick={() => handleDelete(delivery._id)}
                                className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-colors"
                                title="Delete"
                              >
                                <FaTrash className="text-xs" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              
              <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
                <p className="text-sm text-gray-500">
                  Showing {filteredDeliveries.length} of {deliveries.length} deliveries
                </p>
                <div className="flex gap-2">
                  <button className="px-3 py-1 border rounded-lg text-sm hover:bg-gray-100">Previous</button>
                  <button className="px-3 py-1 border rounded-lg text-sm hover:bg-gray-100">Next</button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <MonthlyInvoiceGenerator />
        )}

        {/* Monthly Invoice Modal */}
        {showInvoiceModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Generate Monthly Invoice</h2>
                  <p className="text-sm text-gray-500">Select customer and period to generate invoice</p>
                </div>
                <button onClick={() => {
                  setShowInvoiceModal(false);
                  setMonthlyData(null);
                }} className="text-gray-400 hover:text-gray-600">
                  <FaTimes />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Select Customer</label>
                  <select
                    value={invoiceCustomer}
                    onChange={(e) => setInvoiceCustomer(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                  >
                    <option value="">Select Customer</option>
                    {customers.map(customer => (
                      <option key={customer._id} value={customer._id}>
                        {customer.customerName} ({customer.customerCode})
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Month</label>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-indigo-500 outline-none"
                    >
                      {months.map((month, idx) => (
                        <option key={idx} value={idx + 1}>{month}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Year</label>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-indigo-500 outline-none"
                    >
                      {[2023, 2024, 2025, 2026].map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                {monthlyData && (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <h3 className="font-bold text-gray-800">Monthly Summary</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white rounded-lg p-3">
                        <p className="text-xs text-gray-500">Total Deliveries</p>
                        <p className="text-xl font-bold text-indigo-600">{monthlyData.totalDeliveries}</p>
                      </div>
                      <div className="bg-white rounded-lg p-3">
                        <p className="text-xs text-gray-500">Total Amount</p>
                        <p className="text-xl font-bold text-green-600">₹{monthlyData.totalAmount?.toLocaleString()}</p>
                      </div>
                      <div className="bg-white rounded-lg p-3">
                        <p className="text-xs text-gray-500">Pending Invoicing</p>
                        <p className="text-xl font-bold text-yellow-600">₹{monthlyData.pendingAmount?.toLocaleString()}</p>
                        <p className="text-xs text-gray-400">{monthlyData.pendingCount} deliveries</p>
                      </div>
                      <div className="bg-white rounded-lg p-3">
                        <p className="text-xs text-gray-500">Already Invoiced</p>
                        <p className="text-xl font-bold text-purple-600">₹{monthlyData.invoicedAmount?.toLocaleString()}</p>
                        <p className="text-xs text-gray-400">{monthlyData.invoicedCount} deliveries</p>
                      </div>
                    </div>
                    
                    {selectedDeliveries.length > 0 && (
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-sm font-semibold text-blue-800">
                          Selected {selectedDeliveries.length} deliveries for invoicing
                        </p>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      setSelectedDeliveries([]);
                      getMonthlySummary();
                    }}
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Refresh Summary
                  </button>
                  <button
                    onClick={generateMonthlyInvoice}
                    disabled={!invoiceCustomer}
                    className={`flex-1 px-4 py-2 rounded-lg text-white font-semibold flex items-center justify-center gap-2 ${
                      !invoiceCustomer ? "bg-gray-300 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"
                    }`}
                  >
                    <FaFileInvoice /> Generate Invoice
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <ToastContainer position="top-right" autoClose={3000} />
    </div>
  );
}