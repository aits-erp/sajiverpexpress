// components/MonthlyInvoiceGenerator.js
"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { 
  FaFileInvoice, FaCalendarAlt, FaUsers, FaRupeeSign, 
  FaDownload, FaPrint, FaUser, FaSpinner, FaCheckCircle,
  FaTimes, FaEye, FaFilePdf, FaList, FaClock
} from "react-icons/fa";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

export default function MonthlyInvoiceGenerator() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [invoiceType, setInvoiceType] = useState("single");
  const [selectedSingleCustomer, setSelectedSingleCustomer] = useState("");
  const [singleCustomerData, setSingleCustomerData] = useState(null);
  const [generatedInvoices, setGeneratedInvoices] = useState([]);
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState(null);
  const [showDeliveryList, setShowDeliveryList] = useState(false);
  const [customerDeliveries, setCustomerDeliveries] = useState([]);

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const years = [2023, 2024, 2025, 2026, 2027];

  useEffect(() => {
    fetchMonthlySummary();
  }, [selectedMonth, selectedYear]);

  const fetchMonthlySummary = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("/api/delivery/monthly-summary-all", {
        params: { month: selectedMonth, year: selectedYear },
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        setSummary(res.data.data);
      }
    } catch (error) {
      console.error("Error fetching summary:", error);
      toast.error("Failed to fetch summary");
    } finally {
      setLoading(false);
    }
  };

  const fetchSingleCustomerSummary = async (customerId) => {
    if (!customerId) return;
    
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("/api/delivery/customer-totals", {
        params: {
          customerId: customerId,
          month: selectedMonth,
          year: selectedYear
        },
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.data.success) {
        setSingleCustomerData(res.data.data);
        setCustomerDeliveries(res.data.data.deliveries || []);
        console.log("Customer Summary:", res.data.data);
      }
    } catch (error) {
      console.error("Error fetching customer summary:", error);
      toast.error("Failed to fetch customer summary");
    }
  };

  const fetchCustomerDeliveries = async (customerId) => {
    if (!customerId) return;
    
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("/api/delivery/customer-all-deliveries", {
        params: {
          customerId: customerId,
          month: selectedMonth,
          year: selectedYear
        },
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.data.success) {
        setCustomerDeliveries(res.data.data.deliveries);
        setShowDeliveryList(true);
      }
    } catch (error) {
      console.error("Error fetching deliveries:", error);
      toast.error("Failed to fetch deliveries");
    }
  };

  useEffect(() => {
    if (invoiceType === "single" && selectedSingleCustomer) {
      fetchSingleCustomerSummary(selectedSingleCustomer);
    } else {
      setSingleCustomerData(null);
      setCustomerDeliveries([]);
    }
  }, [selectedSingleCustomer, selectedMonth, selectedYear, invoiceType]);

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedCustomers([]);
    } else {
      const allCustomerIds = summary?.customers?.map(c => c.customerId) || [];
      setSelectedCustomers(allCustomerIds);
    }
    setSelectAll(!selectAll);
  };

  const handleSelectCustomer = (customerId) => {
    if (selectedCustomers.includes(customerId)) {
      setSelectedCustomers(selectedCustomers.filter(id => id !== customerId));
    } else {
      setSelectedCustomers([...selectedCustomers, customerId]);
    }
  };

// Update the generateSingleCustomerInvoice function
const generateSingleCustomerInvoice = async () => {
  if (!selectedSingleCustomer) {
    toast.error("Please select a customer");
    return;
  }

  setGenerating(true);
  try {
    const token = localStorage.getItem("token");
    const res = await axios.post("/api/invoice/generate-monthly", {
      customerId: selectedSingleCustomer,
      month: selectedMonth,
      year: selectedYear
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log("API Response:", res.data);

    if (res.data.success) {
      toast.success(res.data.message);
      
      // Set preview invoice
      setPreviewInvoice(res.data.data.invoice);
      setShowInvoicePreview(true);
      
      // Refresh all data
      await fetchMonthlySummary();
      await fetchSingleCustomerSummary(selectedSingleCustomer);
      
      // Clear any selected deliveries
      setSelectedCustomers([]);
      setSelectAll(false);
    }
  } catch (error) {
    console.error("Error:", error);
    const errorMsg = error.response?.data?.message || error.message || "Failed to generate invoice";
    toast.error(errorMsg);
  } finally {
    setGenerating(false);
  }
};
  const generateBulkInvoices = async () => {
    if (selectedCustomers.length === 0) {
      toast.error("Please select at least one customer");
      return;
    }

    setGenerating(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post("/api/invoice/generate-monthly-all", {
        month: selectedMonth,
        year: selectedYear,
        customerIds: selectedCustomers
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        toast.success(res.data.message);
        setGeneratedInvoices(res.data.data.invoices || []);
        fetchMonthlySummary();
        setSelectedCustomers([]);
        setSelectAll(false);
        
        if (res.data.data.invoices?.length > 0) {
          const shouldDownload = confirm(
            `${res.data.data.invoices.length} invoices generated successfully!\n\nDo you want to download all invoices?`
          );
          if (shouldDownload) {
            downloadAllInvoices(res.data.data.invoices);
          }
        }
      }
    } catch (error) {
      console.error("Error generating bulk invoices:", error);
      toast.error(error.response?.data?.message || "Failed to generate invoices");
    } finally {
      setGenerating(false);
    }
  };

  const downloadSingleInvoice = (invoice) => {
    try {
      const doc = new jsPDF();
      
      doc.setFontSize(20);
      doc.text("TAX INVOICE", 105, 20, { align: "center" });
      
      doc.setFontSize(10);
      doc.text(`Invoice No: ${invoice.invoiceNumber || "N/A"}`, 20, 40);
      doc.text(`Date: ${new Date(invoice.invoiceDate).toLocaleDateString()}`, 20, 50);
      doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`, 20, 60);
      
      doc.text(`Customer: ${invoice.customerName || "N/A"}`, 120, 40);
      doc.text(`Period: ${months[invoice.period?.month - 1]} ${invoice.period?.year}`, 120, 50);
      
      const tableData = (invoice.items || []).map((item, idx) => [
        idx + 1,
        item.itemName || "N/A",
        item.quantity || 0,
        `₹${(item.unitPrice || 0).toLocaleString()}`,
        `₹${(item.discount || 0).toLocaleString()}`,
        `₹${(item.totalAmount || 0).toLocaleString()}`
      ]);
      
      if (tableData.length > 0) {
        doc.autoTable({
          startY: 70,
          head: [["#", "Item", "Qty", "Unit Price", "Discount", "Total"]],
          body: tableData,
          theme: "striped",
          headStyles: { fillColor: [79, 70, 229] }
        });
        
        let finalY = doc.lastAutoTable.finalY + 10;
        doc.text(`Subtotal: ₹${(invoice.subtotal || 0).toLocaleString()}`, 140, finalY);
        doc.text(`GST: ₹${(invoice.gstTotal || 0).toLocaleString()}`, 140, finalY + 10);
        doc.text(`Freight: ₹${(invoice.freightTotal || 0).toLocaleString()}`, 140, finalY + 20);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(`Grand Total: ₹${(invoice.grandTotal || 0).toLocaleString()}`, 140, finalY + 35);
        
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text("This is a computer generated invoice", 105, finalY + 50, { align: "center" });
      }
      
      doc.save(`Invoice_${invoice.invoiceNumber || Date.now()}.pdf`);
    } catch (error) {
      console.error("Error downloading invoice:", error);
      toast.error("Failed to download invoice");
    }
  };

  const downloadAllInvoices = async (invoices) => {
    for (const invoice of invoices) {
      downloadSingleInvoice(invoice);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    toast.success(`Downloaded ${invoices.length} invoices`);
  };

  const downloadBulkSummary = () => {
    if (!generatedInvoices.length) return;
    
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Monthly Invoice Summary", 105, 20, { align: "center" });
    doc.setFontSize(10);
    doc.text(`Month: ${months[selectedMonth - 1]} ${selectedYear}`, 20, 40);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 50);
    doc.text(`Total Invoices: ${generatedInvoices.length}`, 20, 60);
    
    const summaryData = generatedInvoices.map((inv, idx) => [
      idx + 1,
      inv.invoiceNumber || "N/A",
      inv.customerName || "N/A",
      `₹${(inv.amount || 0).toLocaleString()}`
    ]);
    
    doc.autoTable({
      startY: 70,
      head: [["#", "Invoice No", "Customer", "Amount"]],
      body: summaryData,
      theme: "striped"
    });
    
    const totalAmount = generatedInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
    doc.text(`Total Amount: ₹${totalAmount.toLocaleString()}`, 140, doc.lastAutoTable.finalY + 20);
    
    doc.save(`Invoice_Summary_${months[selectedMonth - 1]}_${selectedYear}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <span className="ml-3 text-gray-500">Loading summary...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Invoice Type Toggle */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <FaCalendarAlt className="text-indigo-500" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="px-3 py-2 border rounded-lg text-sm"
              >
                {months.map((month, idx) => (
                  <option key={idx} value={idx + 1}>{month}</option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="px-3 py-2 border rounded-lg text-sm"
              >
                {years.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <button
              onClick={fetchMonthlySummary}
              className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
            >
              Refresh
            </button>
          </div>
          
          <div className="flex gap-2 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setInvoiceType("single")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                invoiceType === "single" 
                  ? "bg-white text-indigo-600 shadow-sm" 
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              <FaUser className="inline mr-2" /> Single Customer
            </button>
            <button
              onClick={() => setInvoiceType("bulk")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                invoiceType === "bulk" 
                  ? "bg-white text-indigo-600 shadow-sm" 
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              <FaUsers className="inline mr-2" /> Bulk Invoice
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
            <p className="text-xs text-blue-600">Total Customers</p>
            <p className="text-2xl font-bold text-blue-900">{summary.totalCustomers || 0}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-4 border border-green-200">
            <p className="text-xs text-green-600">Total Deliveries</p>
            <p className="text-2xl font-bold text-green-900">{summary.totalDeliveries || 0}</p>
          </div>
          <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
            <p className="text-xs text-yellow-600">Pending Amount</p>
            <p className="text-2xl font-bold text-yellow-900">₹{(summary.pendingAmount || 0).toLocaleString()}</p>
          </div>
          <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
            <p className="text-xs text-purple-600">Total Amount</p>
            <p className="text-2xl font-bold text-purple-900">₹{(summary.totalAmount || 0).toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Single Customer Invoice Section */}
      {invoiceType === "single" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h3 className="font-bold text-gray-800">Single Customer Invoice</h3>
            <p className="text-sm text-gray-500">Generate invoice for a specific customer</p>
          </div>
          
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Select Customer</label>
                <select
                  value={selectedSingleCustomer}
                  onChange={(e) => setSelectedSingleCustomer(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-indigo-500 outline-none"
                >
                  <option value="">-- Select Customer --</option>
                  {summary?.customers?.map((customer) => (
                    <option key={customer.customerId} value={customer.customerId}>
                      {customer.customerName} ({customer.customerCode}) - {customer.totalDeliveries} deliveries
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="flex gap-2 items-end">
                <button
                  onClick={() => fetchCustomerDeliveries(selectedSingleCustomer)}
                  disabled={!selectedSingleCustomer}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-2 disabled:bg-gray-300"
                >
                  <FaList /> View Deliveries
                </button>
                <button
                  onClick={generateSingleCustomerInvoice}
                  disabled={generating || !selectedSingleCustomer}
                  className={`flex-1 px-6 py-2 rounded-lg text-white font-semibold flex items-center justify-center gap-2 ${
                    generating || !selectedSingleCustomer
                      ? "bg-gray-300 cursor-not-allowed"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  {generating ? <FaSpinner className="animate-spin" /> : <FaFileInvoice />}
                  {generating ? "Generating..." : "Generate Invoice"}
                </button>
              </div>
            </div>
            
            {/* Single Customer Summary */}
      {singleCustomerData && (
  <div className="mt-6 bg-gray-50 rounded-lg p-4">
    <div className="flex justify-between items-center mb-3">
      <h4 className="font-semibold text-gray-800">Customer Summary</h4>
      <div className="flex gap-2">
        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
          Deliveries: {singleCustomerData.summary?.totalDeliveries || 0}
        </span>
        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
          Invoiced: ₹{(singleCustomerData.summary?.invoicedAmount || 0).toLocaleString()}
        </span>
        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">
          Pending: ₹{(singleCustomerData.summary?.pendingAmount || 0).toLocaleString()}
        </span>
      </div>
    </div>
    
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-white rounded-lg p-3">
        <p className="text-xs text-gray-500">Total Amount (Customer Only)</p>
        <p className="text-2xl font-bold text-blue-600">₹{(singleCustomerData.summary?.totalAmount || 0).toLocaleString()}</p>
      </div>
      <div className="bg-white rounded-lg p-3">
        <p className="text-xs text-gray-500">Already Invoiced</p>
        <p className="text-lg font-bold text-green-600">₹{(singleCustomerData.summary?.invoicedAmount || 0).toLocaleString()}</p>
      </div>
      <div className="bg-white rounded-lg p-3 border-2 border-yellow-200">
        <p className="text-xs text-yellow-600 font-bold">Pending for Invoice</p>
        <p className="text-2xl font-bold text-yellow-600">₹{(singleCustomerData.summary?.pendingAmount || 0).toLocaleString()}</p>
      </div>
    </div>
    
    {/* Show delivery-wise breakdown for this customer */}
    {singleCustomerData.deliveries?.length > 0 && (
      <div className="mt-4">
        <h5 className="text-sm font-bold text-gray-700 mb-2">Delivery-wise Breakdown</h5>
        <div className="space-y-2">
          {singleCustomerData.deliveries.map((delivery, idx) => (
            <div key={idx} className="bg-white rounded-lg p-3 flex justify-between items-center">
              <div>
                <p className="text-sm font-medium">{delivery.deliveryNumber}</p>
                <p className="text-xs text-gray-500">{new Date(delivery.deliveryDate).toLocaleDateString()}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-indigo-600">₹{delivery.customerTotal.toLocaleString()}</p>
                <p className="text-xs text-gray-400">Customer's share</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
)}

            {/* Deliveries List Modal */}
            {showDeliveryList && customerDeliveries.length > 0 && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[80vh] overflow-y-auto">
                  <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">Customer Deliveries</h2>
                      <p className="text-sm text-gray-500">
                        {customerDeliveries[0]?.customerName} - {months[selectedMonth - 1]} {selectedYear}
                      </p>
                    </div>
                    <button onClick={() => setShowDeliveryList(false)} className="text-gray-400 hover:text-gray-600">
                      <FaTimes />
                    </button>
                  </div>
                  <div className="p-6">
                    <div className="space-y-3">
                      {customerDeliveries.map((delivery, idx) => (
                        <div key={idx} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-semibold text-gray-800">{delivery.number}</p>
                              <p className="text-xs text-gray-500">{new Date(delivery.date).toLocaleDateString()}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-emerald-600">₹{delivery.amount.toLocaleString()}</p>
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                delivery.invoiced ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                              }`}>
                                {delivery.invoiced ? "Invoiced" : "Pending"}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="flex justify-between font-bold">
                        <span>Total Pending Amount:</span>
                        <span className="text-red-600">
                          ₹{customerDeliveries
                            .filter(d => !d.invoiced)
                            .reduce((sum, d) => sum + d.amount, 0)
                            .toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bulk Invoice Section */}
      {invoiceType === "bulk" && summary && summary.customers && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selectAll}
                onChange={handleSelectAll}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600"
              />
              <h3 className="font-bold text-gray-800">Customers ({summary.customers.length})</h3>
            </div>
            <button
              onClick={generateBulkInvoices}
              disabled={generating || selectedCustomers.length === 0}
              className={`px-6 py-2 rounded-lg text-white font-semibold flex items-center gap-2 ${
                generating || selectedCustomers.length === 0
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {generating ? <FaSpinner className="animate-spin" /> : <FaFileInvoice />}
              {generating ? "Generating..." : `Generate Invoices (${selectedCustomers.length})`}
            </button>
          </div>
          
          <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {summary.customers.map((customer) => (
              <div key={customer.customerId} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedCustomers.includes(customer.customerId)}
                      onChange={() => handleSelectCustomer(customer.customerId)}
                      className="mt-1 w-4 h-4 rounded border-gray-300 text-indigo-600"
                      disabled={customer.pendingAmount === 0}
                    />
                    <div>
                      <h4 className="font-semibold text-gray-800">{customer.customerName}</h4>
                      <p className="text-xs text-gray-500">Code: {customer.customerCode}</p>
                      <div className="flex gap-4 mt-2 text-sm">
                        <span className="flex items-center gap-1">
                          <FaClock className="text-xs text-gray-400" />
                          Deliveries: {customer.totalDeliveries}
                        </span>
                        <span className="font-semibold text-emerald-600">
                          Total: ₹{customer.totalAmount.toLocaleString()}
                        </span>
                      </div>
                      {customer.pendingAmount > 0 && (
                        <div className="mt-2">
                          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">
                            Pending: ₹{customer.pendingAmount.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {customer.pendingAmount === 0 ? (
                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                      <FaCheckCircle className="inline mr-1 text-xs" /> Fully Invoiced
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">
                      <FaClock className="inline mr-1 text-xs" /> Pending: ₹{customer.pendingAmount.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generated Invoices Summary */}
      {generatedInvoices.length > 0 && (
        <div className="bg-green-50 rounded-xl p-4 border border-green-200">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold text-green-800">
              <FaCheckCircle className="inline mr-2" />
              Generated Invoices ({generatedInvoices.length})
            </h4>
            <button
              onClick={downloadBulkSummary}
              className="px-3 py-1 bg-green-600 text-white rounded-lg text-sm flex items-center gap-2"
            >
              <FaDownload /> Download Summary
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {generatedInvoices.map((invoice, idx) => (
              <div key={idx} className="bg-white rounded-lg p-3 flex items-center justify-between shadow-sm">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800">{invoice.customerName}</p>
                  <p className="text-xs text-gray-500 font-mono">{invoice.invoiceNumber}</p>
                  <p className="text-sm font-bold text-green-600 mt-1">₹{invoice.amount.toLocaleString()}</p>
                </div>
                <button
                  onClick={() => downloadSingleInvoice(invoice)}
                  className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-colors"
                  title="Download Invoice"
                >
                  <FaDownload />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoice Preview Modal */}
      {showInvoicePreview && previewInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Invoice Preview</h2>
                <p className="text-sm text-gray-500">{previewInvoice.invoiceNumber}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => downloadSingleInvoice(previewInvoice)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm flex items-center gap-2"
                >
                  <FaDownload /> Download
                </button>
                <button
                  onClick={() => {
                    setShowInvoicePreview(false);
                    setPreviewInvoice(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <FaTimes />
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="border rounded-xl p-6">
                <div className="text-center mb-6">
                  <h1 className="text-2xl font-bold">TAX INVOICE</h1>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <p><strong>Invoice No:</strong> {previewInvoice.invoiceNumber}</p>
                    <p><strong>Date:</strong> {new Date(previewInvoice.invoiceDate).toLocaleDateString()}</p>
                    <p><strong>Due Date:</strong> {new Date(previewInvoice.dueDate).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p><strong>Customer:</strong> {previewInvoice.customerName}</p>
                    <p><strong>Period:</strong> {months[previewInvoice.period?.month - 1]} {previewInvoice.period?.year}</p>
                    <p><strong>Deliveries:</strong> {previewInvoice.deliveryCount || 0}</p>
                  </div>
                </div>
                
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border p-2 text-left">#</th>
                      <th className="border p-2 text-left">Item</th>
                      <th className="border p-2 text-right">Qty</th>
                      <th className="border p-2 text-right">Price</th>
                      <th className="border p-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(previewInvoice.items || []).map((item, idx) => (
                      <tr key={idx}>
                        <td className="border p-2">{idx + 1}</td>
                        <td className="border p-2">{item.itemName}</td>
                        <td className="border p-2 text-right">{item.quantity}</td>
                        <td className="border p-2 text-right">₹{item.unitPrice}</td>
                        <td className="border p-2 text-right">₹{item.totalAmount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                <div className="text-right mt-4 pt-4 border-t">
                  <p>Subtotal: ₹{(previewInvoice.subtotal || 0).toLocaleString()}</p>
                  <p>GST: ₹{(previewInvoice.gstTotal || 0).toLocaleString()}</p>
                  <p>Freight: ₹{(previewInvoice.freightTotal || 0).toLocaleString()}</p>
                  <h3 className="text-xl font-bold mt-2 text-indigo-600">
                    Grand Total: ₹{(previewInvoice.grandTotal || 0).toLocaleString()}
                  </h3>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}