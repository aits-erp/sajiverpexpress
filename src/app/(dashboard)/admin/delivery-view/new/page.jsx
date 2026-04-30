"use client";

import { useState, useEffect, Suspense, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import ItemSection from "@/components/ItemSection";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { jwtDecode } from "jwt-decode";
import {
  FaArrowLeft, FaCheck, FaUser, FaCalendarAlt,
  FaBoxOpen, FaCalculator, FaPaperclip, FaTimes,
  FaFilePdf, FaPlus, FaFileInvoice, FaSearch, FaSave,
  FaEdit, FaEye, FaTrash, FaPrint, FaDownload
} from "react-icons/fa";

// Helper function
function formatDateForInput(date) {
  if (!date) return "";
  const d = new Date(date);
  return isNaN(d.getTime()) ? "" : d.toISOString().split('T')[0];
}

const initialState = {
  refNumber: "",
  salesEmployee: "",
  status: "Draft",
  deliveryDate: formatDateForInput(new Date()),
  expectedDeliveryDate: "",
  timeSlot: "Morning",
  deliveryShift: 1,
  items: [{
    item: "", itemCode: "", itemId: "", itemName: "", itemDescription: "",
    quantity: 0, allowedQuantity: 0, receivedQuantity: 0,
    unitPrice: 0, discount: 0, freight: 0,
    taxOption: "GST", priceAfterDiscount: 0, totalAmount: 0,
    gstAmount: 0, gstRate: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0,
    warehouse: "", warehouseName: "", warehouseCode: "", warehouseId: "",
    managedByBatch: true,
    customer: "", customerCode: "", customerName: "", contactPerson: "",
  }],
  remarks: "", freight: 0, rounding: 0, totalDownPayment: 0, appliedAmounts: 0,
  totalBeforeDiscount: 0, gstTotal: 0, grandTotal: 0, openBalance: 0,
  attachments: [],
  isSaved: false,
  savedAt: null,
};

const round = (num, d = 2) => {
  const n = Number(num);
  return isNaN(n) ? 0 : Number(n.toFixed(d));
};

function formatDate(d) {
  if (!d) return "";
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const computeItemValues = (item) => {
  const qty = parseFloat(item.quantity) || 0;
  const price = parseFloat(item.unitPrice) || 0;
  const disc = parseFloat(item.discount) || 0;
  const fr = parseFloat(item.freight) || 0;
  const pad = round(price - disc);
  const total = round(qty * pad + fr);
  if (item.taxOption === "GST") {
    const gstRate = parseFloat(item.gstRate) || 0;
    const cgst = round(total * (gstRate / 200));
    return { priceAfterDiscount: pad, totalAmount: total, gstAmount: cgst * 2, cgstAmount: cgst, sgstAmount: cgst, igstAmount: 0 };
  }
  const igst = round(total * ((parseFloat(item.gstRate) || 0) / 100));
  return { priceAfterDiscount: pad, totalAmount: total, gstAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: igst };
};

const Lbl = ({ text, req }) => (
  <label className="block text-[10.5px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
    {text}{req && <span className="text-red-500 ml-0.5">*</span>}
  </label>
);

const fi = (readOnly = false) =>
  `w-full px-3 py-2.5 rounded-lg border text-sm font-medium transition-all outline-none
   ${readOnly ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed" : "border-gray-200 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 placeholder:text-gray-300"}`;

const SectionCard = ({ icon: Icon, title, subtitle, children, color = "indigo" }) => (
  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-5">
    <div className={`flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-${color}-50/40`}>
      <div className={`w-8 h-8 rounded-lg bg-${color}-100 flex items-center justify-center text-${color}-500`}>
        <Icon className="text-sm" />
      </div>
      <div>
        <p className="text-sm font-bold text-gray-900">{title}</p>
        {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
      </div>
    </div>
    <div className="px-6 py-5">{children}</div>
  </div>
);

function ItemImage({ src, alt, className = "w-10 h-10" }) {
  const [err, setErr] = useState(false);
  useEffect(() => { setErr(false); }, [src]);

  if (!src || err) {
    return (
      <div className={`${className} rounded-lg border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center shrink-0`}>
        <FaBoxOpen className="text-gray-300 text-sm" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt || "Item"}
      className={`${className} object-cover rounded-lg border border-gray-200 shrink-0`}
      onError={() => setErr(true)}
    />
  );
}

export default function DeliveryPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-gray-400">Loading Delivery Form...</div>}>
      <DeliveryForm />
    </Suspense>
  );
}

function DeliveryForm() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("editId");

  const [formData, setFormData] = useState(initialState);
  const [attachments, setAttachments] = useState([]);
  const [existingFiles, setExistingFiles] = useState([]);
  const [removedFiles, setRemovedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [stockError, setStockError] = useState(null);
  const [customerWiseTotals, setCustomerWiseTotals] = useState({});
  const [showSummary, setShowSummary] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  
  // Multiple delivery states
  const [sameDayDeliveries, setSameDayDeliveries] = useState([]);
  const [showSameDayWarning, setShowSameDayWarning] = useState(false);
  const [timeSlot, setTimeSlot] = useState("Morning");
  const [deliveryShift, setDeliveryShift] = useState(1);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [monthlySummary, setMonthlySummary] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  // Customer search in summary
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [filteredCustomerTotals, setFilteredCustomerTotals] = useState({});
  
  // Auto-save timer
  const autoSaveTimer = useRef(null);
  const [lastAutoSave, setLastAutoSave] = useState(null);

  const stableInitial = useMemo(() => initialState, []);
  const isReadOnly = !!editId && !isAdmin;

  // Initial Auth
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const d = jwtDecode(token);
      const roles = Array.isArray(d?.roles) ? d.roles : [];
      setIsAdmin(roles.includes("admin") || roles.includes("sales manager") || d?.type === "company");
    } catch (e) { console.error(e); }
  }, []);

  // Auto-save functionality
  useEffect(() => {
    if (!formData.isSaved && formData.items.length > 0) {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        saveToLocalStorage();
      }, 30000); // Auto-save every 30 seconds
    }
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [formData]);

  const saveToLocalStorage = () => {
    const saveData = {
      ...formData,
      isSaved: true,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem("delivery_draft", JSON.stringify(saveData));
    setIsSaved(true);
    setLastAutoSave(new Date());
    toast.info("Draft auto-saved", { autoClose: 2000 });
  };

  const loadFromLocalStorage = () => {
    const saved = localStorage.getItem("delivery_draft");
    if (saved) {
      const parsed = JSON.parse(saved);
      setFormData(parsed);
      setIsSaved(true);
      toast.info("Loaded saved draft", { autoClose: 2000 });
    }
  };

  const clearLocalStorage = () => {
    localStorage.removeItem("delivery_draft");
    setIsSaved(false);
  };

  // Load from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem("deliveryData");
    setAttachmentsLoading(true);
    if (!stored) { 
      // Check local storage for draft
      loadFromLocalStorage();
      setAttachmentsLoading(false); 
      return; 
    }
    try {
      const parsed = JSON.parse(stored);
      setFormData({ ...stableInitial, ...parsed, deliveryDate: formatDate(new Date()), expectedDeliveryDate: "" });
      if (Array.isArray(parsed.attachments) && parsed.attachments.length > 0) {
        const normalized = parsed.attachments
          .map(f => f?.fileUrl ? { fileUrl: f.fileUrl, fileName: f.fileName || f.fileUrl.split("/").pop() || "Attachment", fileType: f.fileType || "image/*" } : null)
          .filter(Boolean);
        setExistingFiles(normalized);
      }
      setIsCopied(true);
    } catch (err) { console.error(err); }
    finally { sessionStorage.removeItem("deliveryData"); setAttachmentsLoading(false); }
  }, [stableInitial]);

  // Load existing for edit
  useEffect(() => {
    if (editId && /^[0-9a-fA-F]{24}$/.test(editId)) {
      setLoading(true);
      axios.get(`/api/delivery/${editId}`)
        .then(res => {
          const record = res.data.data;
          const items = Array.isArray(record.items)
            ? record.items.map(i => ({
                ...stableInitial.items[0],
                ...i,
                item: i.item?._id || i.item || "",
                warehouse: i.warehouse?._id || i.warehouse || "",
                taxOption: i.taxOption || "GST",
                customer: i.customer?._id || i.customer || "",
                customerCode: i.customerCode || "",
                customerName: i.customerName || "",
                contactPerson: i.contactPerson || "",
              }))
            : [...stableInitial.items];
          setFormData({ ...stableInitial, ...record, items, deliveryDate: formatDate(record.deliveryDate), expectedDeliveryDate: formatDate(record.expectedDeliveryDate) });
          setTimeSlot(record.timeSlot || "Morning");
          setDeliveryShift(record.deliveryShift || 1);
          if (!isCopied) {
            setExistingFiles((record.attachments || []).map(f => ({ fileUrl: f.fileUrl || f.url, fileName: f.fileName || "Attachment" })));
          }
        })
        .catch(err => setError(err.message || "Failed to load"))
        .finally(() => setLoading(false));
    }
  }, [editId, isCopied, stableInitial]);

  // Check for same day deliveries
  const checkSameDayDeliveries = async (customerId, deliveryDate) => {
    if (!customerId || !deliveryDate) return;
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`/api/delivery/check-same-day`, {
        params: { customerId, deliveryDate: formatDate(deliveryDate) },
        headers: { Authorization: `Bearer ${token}` }
      });
      setSameDayDeliveries(res.data.deliveries);
      setShowSameDayWarning(res.data.count > 0);
      if (res.data.count > 0) {
        setDeliveryShift(res.data.count + 1);
      }
    } catch (error) {
      console.error("Error checking deliveries:", error);
    }
  };

  // Totals Calculation with customer-wise grouping
  useEffect(() => {
    const items = Array.isArray(formData.items) ? formData.items : [];
    
    const totalBeforeDiscount = items.reduce((s, i) => s + (Number(i.unitPrice) * Number(i.quantity) - Number(i.discount)), 0);
    const gstTotal = items.reduce((s, i) => s + (Number(i.gstAmount) || 0), 0);
    const grandTotal = totalBeforeDiscount + gstTotal + Number(formData.freight) + Number(formData.rounding);
    const openBalance = grandTotal - (Number(formData.totalDownPayment) + Number(formData.appliedAmounts));

    const customerTotals = {};
    items.forEach((item, idx) => {
      const customerKey = item.customer || `no-customer-${idx}`;
      const customerName = item.customerName || "No Customer Assigned";
      
      if (!customerTotals[customerKey]) {
        customerTotals[customerKey] = {
          customerId: customerKey,
          customerName: customerName,
          customerCode: item.customerCode || "",
          subtotal: 0,
          gstAmount: 0,
          total: 0,
          items: [],
          itemCount: 0
        };
      }
      
      const itemSubtotal = (Number(item.unitPrice) * Number(item.quantity) - Number(item.discount));
      const itemGst = (Number(item.gstAmount) || 0);
      
      customerTotals[customerKey].subtotal += itemSubtotal;
      customerTotals[customerKey].gstAmount += itemGst;
      customerTotals[customerKey].total += itemSubtotal + itemGst;
      customerTotals[customerKey].items.push(item);
      customerTotals[customerKey].itemCount++;
    });
    
    setCustomerWiseTotals(customerTotals);
    
    // Filter customers based on search term
    if (customerSearchTerm) {
      const filtered = {};
      Object.entries(customerTotals).forEach(([key, data]) => {
        if (data.customerName.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
            data.customerCode.toLowerCase().includes(customerSearchTerm.toLowerCase())) {
          filtered[key] = data;
        }
      });
      setFilteredCustomerTotals(filtered);
    } else {
      setFilteredCustomerTotals(customerTotals);
    }
    
    setFormData(prev => {
      if (prev.grandTotal === round(grandTotal) && prev.totalBeforeDiscount === round(totalBeforeDiscount)) return prev;
      return {
        ...prev,
        totalBeforeDiscount: round(totalBeforeDiscount),
        gstTotal: round(gstTotal),
        grandTotal: round(grandTotal),
        openBalance: round(openBalance)
      };
    });
  }, [formData.items, formData.freight, formData.rounding, formData.totalDownPayment, formData.appliedAmounts, customerSearchTerm]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value, isSaved: false }));
  };

  const handleDeliveryDateChange = async (e) => {
    const date = e.target.value;
    handleChange(e);
    
    const firstItemWithCustomer = formData.items.find(item => item.customer);
    if (firstItemWithCustomer && firstItemWithCustomer.customer) {
      await checkSameDayDeliveries(firstItemWithCustomer.customer, date);
    }
  };

  const handleItemChange = (index, e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], [name]: value, ...computeItemValues({ ...items[index], [name]: value }) };
      
      if (name === 'customer' && value && prev.deliveryDate) {
        checkSameDayDeliveries(value, prev.deliveryDate);
      }
      
      return { ...prev, items, isSaved: false };
    });
  };

  const addItemRow = () => setFormData(p => ({ ...p, items: [...p.items, { ...stableInitial.items[0] }], isSaved: false }));
  const removeItemRow = (i) => setFormData(p => ({ ...p, items: p.items.filter((_, idx) => idx !== i), isSaved: false }));

  const validateForm = () => {
    if (!formData.deliveryDate) {
      toast.error("Delivery date is required.");
      return false;
    }
    if (formData.items.length === 0) {
      toast.error("At least one item is required.");
      return false;
    }

    for (let i = 0; i < formData.items.length; i++) {
      const item = formData.items[i];
      if (!item.item || item.item === "") {
        toast.error(`Item selection missing in row ${i + 1}`);
        return false;
      }
      if (!item.customer || item.customer === "") {
        toast.error(`Please select a customer for item in row ${i + 1}`);
        return false;
      }
      if (Number(item.quantity) <= 0) {
        toast.error(`Quantity must be greater than 0 in row ${i + 1}`);
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    setStockError(null);

    try {
      const token = localStorage.getItem("token");
      if (!token) { toast.error("Not authenticated"); setSubmitting(false); return; }

      const normalizedItems = formData.items.map(i => ({
        ...i,
        item: typeof i.item === "object" ? i.item._id : i.item,
        warehouse: typeof i.warehouse === "object" ? i.warehouse._id : i.warehouse,
        customer: typeof i.customer === "object" ? i.customer._id : i.customer,
      }));

      const fd = new FormData();
      fd.append("deliveryData", JSON.stringify({ 
        ...formData, 
        items: normalizedItems, 
        removedFiles,
        timeSlot,
        deliveryShift
      }));
      attachments.forEach(file => fd.append("newFiles", file));

      const config = { headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" } };

      const res = editId
        ? await axios.put(`/api/delivery/${editId}`, fd, config)
        : await axios.post("/api/delivery", fd, config);

      if (res.data.success) {
        toast.success(editId ? "Delivery Updated" : `Delivery Created: ${res.data.data.deliveryNumber}`);
        clearLocalStorage();
        router.push("/admin/delivery-view");
      }
    } catch (err) {
      const data = err.response?.data;
      const msg = data?.message || data?.msg || data?.error || err.message || null;
      const isStockError = msg && ["stock", "insufficient", "pre-check", "available", "required"].some(kw => msg.toLowerCase().includes(kw));

      if (isStockError) {
        setStockError(msg);
        window.scrollTo({ top: 0, behavior: "smooth" });
        toast.error("Stock insufficient! Check the banner.");
        return;
      }
      toast.error(msg || "Error saving delivery");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveDraft = () => {
    saveToLocalStorage();
    toast.success("Draft saved successfully");
  };

  const fetchMonthlySummary = async () => {
    const firstCustomer = formData.items.find(item => item.customer);
    if (!firstCustomer || !firstCustomer.customer) {
      toast.error("Please add at least one item with customer to view monthly summary");
      return;
    }
    
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("/api/delivery/monthly-summary", {
        params: { 
          customerId: firstCustomer.customer, 
          month: selectedMonth, 
          year: selectedYear 
        },
        headers: { Authorization: `Bearer ${token}` }
      });
      setMonthlySummary(res.data.data);
      setShowInvoiceModal(true);
    } catch (error) {
      toast.error("Failed to fetch monthly summary");
    }
  };

  const renderNewFilesPreview = () => attachments.length > 0 && (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-3">
      {attachments.map((file, idx) => {
        if (!(file instanceof File)) return null;
        const url = URL.createObjectURL(file);
        return (
          <div key={idx} className="relative border rounded-xl p-2 text-center bg-gray-50">
            {file.type === "application/pdf" ? (
              <object data={url} type="application/pdf" className="h-24 w-full rounded" />
            ) : (
              <img src={url} alt={file.name} className="h-24 w-full object-cover rounded" />
            )}
            <button onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
              <FaTimes />
            </button>
          </div>
        );
      })}
    </div>
  );

  if (loading) return <div className="p-10 text-center text-gray-400">Loading Delivery Data...</div>;
  if (error) return <div className="p-10 text-red-500 text-center">{error}</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/admin/delivery-view")}
              className="flex items-center gap-1.5 text-indigo-600 font-semibold text-sm hover:text-indigo-800 transition-colors">
              <FaArrowLeft className="text-xs" /> Back
            </button>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">
                {editId ? "Edit Delivery" : "New Delivery"}
              </h1>
              <p className="text-sm text-gray-400 mt-0.5">Fill in the details - Customers per item</p>
            </div>
          </div>
          <div className="flex gap-2">
            {!editId && (
              <>
                <button
                  onClick={handleSaveDraft}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition-colors"
                >
                  <FaSave /> Save Draft
                </button>
                <button
                  onClick={fetchMonthlySummary}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 transition-colors"
                >
                  <FaFileInvoice /> Monthly Summary
                </button>
              </>
            )}
          </div>
        </div>

        {/* Auto-save indicator */}
        {isSaved && lastAutoSave && (
          <div className="mb-4 text-right">
            <span className="text-xs text-green-600 bg-green-50 px-3 py-1 rounded-full">
              Last saved: {lastAutoSave.toLocaleTimeString()}
            </span>
          </div>
        )}

        {stockError && (
          <div className="mb-5 flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-4 shadow-sm">
            <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-red-100 flex items-center justify-center text-lg mt-0.5">⚠️</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-red-700 mb-0.5">Stock Pre-Check Failed</p>
              <p className="text-sm text-red-600 leading-relaxed font-medium">{stockError}</p>
            </div>
            <button onClick={() => setStockError(null)} className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-red-300 hover:text-red-500 hover:bg-red-100 text-base">×</button>
          </div>
        )}

        {/* Delivery Information */}
        <SectionCard icon={FaCalendarAlt} title="Delivery Information" color="blue">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Lbl text="Delivery Date" req />
              <input type="date" className={fi()} name="deliveryDate" value={formData.deliveryDate || ""} onChange={handleDeliveryDateChange} />
            </div>
            <div>
              <Lbl text="Expected Delivery" />
              <input type="date" className={fi()} name="expectedDeliveryDate" value={formData.expectedDeliveryDate || ""} onChange={handleChange} />
            </div>
            <div>
              <Lbl text="Time Slot" />
              <select className={fi()} value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)}>
                <option value="Morning">Morning (9 AM - 12 PM)</option>
                <option value="Afternoon">Afternoon (12 PM - 3 PM)</option>
                <option value="Evening">Evening (3 PM - 6 PM)</option>
                <option value="Night">Night (6 PM - 9 PM)</option>
              </select>
            </div>
            <div>
              <Lbl text="Status" />
              <select className={fi()} name="status" value={formData.status} onChange={handleChange}>
                <option>Draft</option>
                <option>Open</option>
                <option>Pending</option>
                <option>Shipped</option>
                <option>Delivered</option>
                <option>Cancelled</option>
              </select>
            </div>
            <div>
              <Lbl text="Reference No." />
              <input className={fi()} name="refNumber" value={formData.refNumber || ""} onChange={handleChange} placeholder="e.g. DEL-12345" />
            </div>
            <div>
              <Lbl text="Sales Employee" />
              <input className={fi()} name="salesEmployee" value={formData.salesEmployee || ""} onChange={handleChange} placeholder="Sales person name" />
            </div>
          </div>
        </SectionCard>

        {/* Same Day Warning */}
        {showSameDayWarning && sameDayDeliveries.length > 0 && (
          <div className="mb-5 bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <div className="text-yellow-600 text-xl">⚠️</div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-yellow-800">Existing deliveries for this customer today:</p>
                <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                  {sameDayDeliveries.map(del => (
                    <div key={del._id} className="text-xs text-yellow-700">
                      • {del.deliveryNumber} - {del.timeSlot || 'No time slot'} (₹{del.grandTotal?.toLocaleString()})
                    </div>
                  ))}
                </div>
                <p className="text-xs text-yellow-700 mt-2">
                  This will be delivery #{sameDayDeliveries.length + 1} for today. Shift number: {deliveryShift}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Items Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-5">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-emerald-50/40">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-500">
              <FaBoxOpen className="text-sm" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Line Items</p>
              <p className="text-xs text-gray-500">Each item requires a customer assignment</p>
            </div>
          </div>
          <div className="p-4">
            <ItemSection
              items={formData.items}
              onItemChange={handleItemChange}
              onAddItem={addItemRow}
              onRemoveItem={removeItemRow}
            />
          </div>
        </div>

        {/* Item Summary Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-5">
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 bg-purple-50/40">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-500">
                <FaBoxOpen className="text-sm" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">Item Summary</p>
                <p className="text-xs text-gray-500">Complete list of all items</p>
              </div>
            </div>
            <button
              onClick={() => setShowSummary(!showSummary)}
              className="text-xs text-purple-600 hover:text-purple-700 font-medium"
            >
              {showSummary ? "Hide Summary" : "Show Summary"}
            </button>
          </div>
          
          {showSummary && (
            <div className="p-4">
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {formData.items.map((item, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-bold text-gray-400">#{idx + 1}</span>
                          <h4 className="font-semibold text-gray-800">{item.itemName || "Unnamed Item"}</h4>
                          {item.itemCode && (
                            <span className="text-xs text-gray-400 font-mono">({item.itemCode})</span>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          <div>
                            <span className="text-gray-500">Customer:</span>
                            <span className="ml-2 font-medium text-gray-700">{item.customerName || "Not assigned"}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Quantity:</span>
                            <span className="ml-2 font-medium text-gray-700">{item.quantity}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Unit Price:</span>
                            <span className="ml-2 font-medium text-gray-700">₹{item.unitPrice}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Total:</span>
                            <span className="ml-2 font-bold text-emerald-600">₹{(item.totalAmount || 0).toLocaleString()}</span>
                          </div>
                        </div>
                        
                        {item.itemDescription && (
                          <p className="text-xs text-gray-500 mt-2">{item.itemDescription}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                
                {formData.items.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <FaBoxOpen className="text-3xl mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No items added yet</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Customer-wise Summary with Search */}
        {Object.keys(customerWiseTotals).length > 0 && (
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-6 mb-6 border border-indigo-200">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                  <FaUser className="text-indigo-600 text-lg" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Customer-wise Summary</h3>
                  <p className="text-sm text-gray-500">Detailed breakdown by customer</p>
                </div>
              </div>
              
              {/* Customer Search */}
              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                <input
                  type="text"
                  placeholder="Search customer..."
                  value={customerSearchTerm}
                  onChange={(e) => setCustomerSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-xl text-sm w-64 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                />
                {customerSearchTerm && (
                  <button
                    onClick={() => setCustomerSearchTerm("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"
                  >
                    <FaTimes className="text-xs" />
                  </button>
                )}
              </div>
            </div>
            
            {/* Scrollable Customer List */}
            <div className="max-h-[600px] overflow-y-auto space-y-4 pr-2">
              {Object.entries(filteredCustomerTotals).length > 0 ? (
                Object.entries(filteredCustomerTotals).map(([custId, data], idx) => (
                  <div key={custId} className="bg-white rounded-xl border border-indigo-200 overflow-hidden shadow-sm">
                    <div className="bg-gradient-to-r from-indigo-100 to-white px-5 py-4 border-b border-indigo-200 sticky top-0 bg-white">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-3">
                            <span className="w-8 h-8 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <div>
                              <h4 className="font-bold text-gray-800 text-base">{data.customerName}</h4>
                              {data.customerCode && (
                                <p className="text-xs text-gray-500">Code: {data.customerCode}</p>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-indigo-600">₹{data.total.toLocaleString('en-IN')}</div>
                          <div className="text-xs text-gray-500">
                            {data.itemCount} {data.itemCount === 1 ? 'item' : 'items'} | 
                            Subtotal: ₹{data.subtotal.toLocaleString('en-IN')} | 
                            GST: ₹{data.gstAmount.toLocaleString('en-IN')}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                          <tr>
                            <th className="text-left py-3 px-4 text-xs font-bold text-gray-500 uppercase">#</th>
                            <th className="text-left py-3 px-4 text-xs font-bold text-gray-500 uppercase">Item</th>
                            <th className="text-left py-3 px-4 text-xs font-bold text-gray-500 uppercase">Code</th>
                            <th className="text-right py-3 px-4 text-xs font-bold text-gray-500 uppercase">Qty</th>
                            <th className="text-right py-3 px-4 text-xs font-bold text-gray-500 uppercase">Price</th>
                            <th className="text-right py-3 px-4 text-xs font-bold text-gray-500 uppercase">Discount</th>
                            <th className="text-right py-3 px-4 text-xs font-bold text-gray-500 uppercase">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {formData.items
                            .filter(item => (item.customer === custId || item.customerName === data.customerName))
                            .map((item, itemIdx) => (
                              <tr key={itemIdx} className="hover:bg-gray-50 transition-colors">
                                <td className="py-2 px-4 text-xs text-gray-500">{itemIdx + 1}</td>
                                <td className="py-2 px-4">
                                  <div className="flex items-center gap-2">
                                    <ItemImage src={item.imageUrl} alt={item.itemName} className="w-8 h-8" />
                                    <span className="font-medium text-gray-800">{item.itemName || "Unnamed Item"}</span>
                                  </div>
                                </td>
                                <td className="py-2 px-4 text-xs text-gray-500 font-mono">{item.itemCode || "-"}</td>
                                <td className="py-2 px-4 text-right text-sm">{item.quantity}</td>
                                <td className="py-2 px-4 text-right text-sm">₹{item.unitPrice}</td>
                                <td className="py-2 px-4 text-right text-sm text-red-500">-₹{item.discount}</td>
                                <td className="py-2 px-4 text-right font-semibold text-emerald-600">₹{(item.totalAmount || 0).toLocaleString('en-IN')}</td>
                              </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t-2 border-indigo-200">
                          <tr>
                            <td colSpan="6" className="py-3 px-4 text-right font-bold text-gray-700">Subtotal:</td>
                            <td className="py-3 px-4 text-right font-bold text-gray-800">₹{data.subtotal.toLocaleString('en-IN')}</td>
                          </tr>
                          <tr className="border-t border-gray-200">
                            <td colSpan="6" className="py-2 px-4 text-right font-bold text-gray-700">GST Total:</td>
                            <td className="py-2 px-4 text-right font-bold text-gray-800">₹{data.gstAmount.toLocaleString('en-IN')}</td>
                          </tr>
                          <tr className="bg-indigo-50">
                            <td colSpan="6" className="py-3 px-4 text-right font-bold text-indigo-700 text-base">Grand Total:</td>
                            <td className="py-3 px-4 text-right font-bold text-indigo-700 text-lg">₹{data.total.toLocaleString('en-IN')}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 bg-white rounded-xl">
                  <p className="text-gray-400">No customers found matching "{customerSearchTerm}"</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Financial Summary */}
        <SectionCard icon={FaCalculator} title="Financial Summary" color="amber">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Lbl text="Total Before Discount" />
              <input readOnly value={`₹ ${formData.totalBeforeDiscount.toLocaleString()}`} className={fi(true)} />
            </div>
            <div>
              <Lbl text="GST Total" />
              <input readOnly value={`₹ ${formData.gstTotal.toLocaleString()}`} className={fi(true)} />
            </div>
            <div>
              <Lbl text="Freight" />
              <input type="number" name="freight" value={formData.freight} onChange={handleChange} className={fi()} />
            </div>
            <div>
              <Lbl text="Rounding" />
              <input type="number" name="rounding" value={formData.rounding} onChange={handleChange} className={fi()} />
            </div>
            <div>
              <Lbl text="Grand Total" />
              <div className="px-3 py-2.5 rounded-lg border-2 border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-extrabold">
                ₹ {formData.grandTotal.toLocaleString()}
              </div>
            </div>
            <div>
              <Lbl text="Open Balance" />
              <input readOnly value={`₹ ${formData.openBalance.toLocaleString()}`} className={fi(true)} />
            </div>
          </div>
          <div className="mt-4">
            <Lbl text="Remarks" />
            <textarea name="remarks" value={formData.remarks || ""} onChange={handleChange} rows={2} className={`${fi()} resize-none`} placeholder="Add any internal notes..." />
          </div>
        </SectionCard>

        {/* Attachments */}
        <SectionCard icon={FaPaperclip} title="Attachments" color="gray">
          <div className="mb-4">
            {attachmentsLoading ? (
              <div className="p-3 text-center text-xs text-gray-400">Loading...</div>
            ) : existingFiles.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {existingFiles.map((file, idx) => (
                  <div key={idx} className="relative group border rounded-xl p-2 bg-gray-50">
                    <div className="h-20 flex items-center justify-center overflow-hidden rounded-lg">
                      {(file.fileUrl?.toLowerCase().endsWith(".pdf")) ? (
                        <FaFilePdf className="text-4xl text-red-500" />
                      ) : (
                        <img src={file.fileUrl} alt={file.fileName} className="h-full object-cover" />
                      )}
                    </div>
                    <a href={file.fileUrl} target="_blank" rel="noopener noreferrer" className="block text-[10px] text-indigo-600 mt-1 truncate font-semibold">
                      {file.fileName}
                    </a>
                    {!isReadOnly && (
                      <button onClick={() => {
                        setExistingFiles(prev => prev.filter((_, i) => i !== idx));
                        setRemovedFiles(prev => [...prev, file]);
                      }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]">
                        <FaTimes />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 text-center text-xs text-gray-400">No attachments</div>
            )}
          </div>
          <label className="flex items-center justify-center gap-3 px-4 py-4 rounded-xl border-2 border-dashed border-gray-200 cursor-pointer hover:bg-indigo-50 transition-all">
            <FaPaperclip className="text-gray-300" />
            <span className="text-sm font-medium text-gray-400">Click to upload new files</span>
            <input type="file" multiple accept="image/*,application/pdf" hidden onChange={(e) => {
              const files = Array.from(e.target.files);
              setAttachments(prev => [...prev, ...files]);
              e.target.value = "";
            }} />
          </label>
          {renderNewFilesPreview()}
        </SectionCard>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-4 pt-4 pb-10">
          <button onClick={() => router.push("/admin/delivery-view")}
            className="px-6 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            className={`px-8 py-2.5 rounded-xl text-white font-bold text-sm shadow-lg transition-all flex items-center gap-2 ${submitting ? "bg-gray-300 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"}`}>
            {submitting ? "Processing..." : editId ? <><FaCheck /> Update Delivery</> : <><FaCheck /> Create Delivery</>}
          </button>
        </div>
      </div>

      {/* Monthly Invoice Modal */}
      {showInvoiceModal && monthlySummary && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Monthly Delivery Summary</h2>
                <p className="text-sm text-gray-500">
                  {months[selectedMonth - 1]} {selectedYear}
                </p>
              </div>
              <button onClick={() => setShowInvoiceModal(false)} className="text-gray-400 hover:text-gray-600">
                <FaTimes />
              </button>
            </div>
            <div className="p-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-xs text-blue-600">Total Deliveries</p>
                  <p className="text-2xl font-bold text-blue-900">{monthlySummary.totalDeliveries}</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4">
                  <p className="text-xs text-green-600">Total Amount</p>
                  <p className="text-2xl font-bold text-green-900">₹{monthlySummary.totalAmount?.toLocaleString()}</p>
                </div>
                <div className="bg-yellow-50 rounded-xl p-4">
                  <p className="text-xs text-yellow-600">Pending Invoicing</p>
                  <p className="text-2xl font-bold text-yellow-900">₹{monthlySummary.pendingAmount?.toLocaleString()}</p>
                  <p className="text-xs">{monthlySummary.pendingCount} deliveries</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-4">
                  <p className="text-xs text-purple-600">Already Invoiced</p>
                  <p className="text-2xl font-bold text-purple-900">₹{monthlySummary.invoicedAmount?.toLocaleString()}</p>
                  <p className="text-xs">{monthlySummary.invoicedCount} deliveries</p>
                </div>
              </div>

              {/* Deliveries Table */}
              {monthlySummary.deliveries?.length > 0 ? (
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500">Delivery #</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500">Time Slot</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-gray-500">Amount</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-500">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {monthlySummary.deliveries.map((delivery) => (
                        <tr key={delivery._id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs">{delivery.deliveryNumber}</td>
                          <td className="px-4 py-3">{new Date(delivery.deliveryDate).toLocaleDateString()}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                              {delivery.timeSlot || `Shift ${delivery.deliveryShift}`}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">₹{delivery.grandTotal?.toLocaleString()}</td>
                          <td className="px-4 py-3 text-center">
                            {delivery.isInvoiced ? (
                              <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">Invoiced</span>
                            ) : (
                              <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">Pending</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">No deliveries found for this period</div>
              )}
            </div>
          </div>
        </div>
      )}

      <ToastContainer position="top-right" autoClose={3000} />
    </div>
  );
}

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];