"use client";
import { useEffect, useState, useRef, Fragment } from "react";
import axios from "axios";
import PropTypes from "prop-types";
import { toast } from "react-toastify";
import {
  FaTrash, FaPlus, FaSearch, FaTimes,
  FaBoxOpen, FaWarehouse, FaUser,
  FaChevronUp, FaEdit
} from "react-icons/fa";

/* ── Helpers ── */
const round = (num, decimals = 2) => {
  const n = Number(num);
  if (isNaN(n)) return 0;
  return Number(n.toFixed(decimals));
};

const computeItemValues = (item) => {
  const quantity = parseFloat(item.quantity) || 0;
  const unitPrice = parseFloat(item.unitPrice) || 0;
  const discount = parseFloat(item.discount) || 0;
  const freight = parseFloat(item.freight) || 0;
  const priceAfterDiscount = round(unitPrice - discount);
  const totalAmount = round(quantity * priceAfterDiscount + freight);

  if (item.taxOption === "GST") {
    const gstRate = parseFloat(item.gstRate) || 0;
    const cgstAmount = round(totalAmount * (gstRate / 2 / 100));
    const sgstAmount = round(totalAmount * (gstRate / 2 / 100));
    return { priceAfterDiscount, totalAmount, gstAmount: cgstAmount + sgstAmount, cgstAmount, sgstAmount, igstAmount: 0 };
  }
  if (item.taxOption === "IGST") {
    let igstRate = item.igstRate;
    if (!igstRate || parseFloat(igstRate) === 0) igstRate = parseFloat(item.gstRate) || 0;
    else igstRate = parseFloat(igstRate);
    return { priceAfterDiscount, totalAmount, gstAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: round(totalAmount * (igstRate / 100)) };
  }
  return { priceAfterDiscount, totalAmount, gstAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0 };
};

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

const ItemSection = ({ items, onItemChange, onAddItem, onRemoveItem }) => {
  const [apiItems, setApiItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [filteredWarehouses, setFilteredWarehouses] = useState([]);
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showWhDropdown, setShowWhDropdown] = useState(false);
  const [activeIdx, setActiveIdx] = useState(null);
  const [activeField, setActiveField] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  
  const dropdownRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    (async () => {
      try {
        const [iRes, cRes, wRes] = await Promise.all([
          axios.get("/api/items", { headers: { Authorization: `Bearer ${token}` } }),
          axios.get("/api/customers", { headers: { Authorization: `Bearer ${token}` } }),
          axios.get("/api/warehouse", { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        const itemData = iRes.data?.success ? iRes.data.data : (Array.isArray(iRes.data) ? iRes.data : []);
        const customerData = cRes.data?.success ? cRes.data.data : (Array.isArray(cRes.data) ? cRes.data : []);
        const whData = wRes.data?.success ? wRes.data.data : (Array.isArray(wRes.data) ? wRes.data : []);
        
        setApiItems(itemData);
        setCustomers(customerData);
        setWarehouses(whData);
      } catch (e) { 
        console.error("Fetch error:", e); 
      }
    })();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowItemDropdown(false);
        setShowCustomerDropdown(false);
        setShowWhDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleItemSearch = (index, value) => {
    onItemChange(index, { target: { name: "itemName", value } });
    if (!value) { 
      setShowItemDropdown(false); 
      return; 
    }
    const f = apiItems.filter(i => (i.itemName || "").toLowerCase().includes(value.toLowerCase()));
    if (f.length) { 
      setFilteredItems(f); 
      setShowItemDropdown(true); 
      setActiveIdx(index);
      setActiveField('item');
    } else { 
      setShowItemDropdown(false); 
    }
  };

  const handleItemSelect = (index, sel) => {
    const row = {
      item: sel._id,
      imageUrl: sel.imageUrl || sel.image || "",
      itemCode: sel.itemCode || "",
      itemName: sel.itemName || "",
      itemDescription: sel.description || "",
      unitPrice: parseFloat(sel.unitPrice) || 0,
      discount: 0,
      freight: 0,
      quantity: 1,
      taxOption: sel.taxOption || "GST",
      gstRate: sel.gstRate || 0,
      igstRate: sel.igstRate || 0,
      cgstAmount: 0,
      sgstAmount: 0,
      gstAmount: 0,
      priceAfterDiscount: parseFloat(sel.unitPrice) || 0,
      totalAmount: parseFloat(sel.unitPrice) || 0,
      customer: "",
      customerCode: "",
      customerName: "",
      contactPerson: "",
      warehouse: "",
      warehouseName: "",
      warehouseCode: "",
    };

    const computed = computeItemValues(row);
    Object.entries({ ...row, ...computed }).forEach(([k, v]) => 
      onItemChange(index, { target: { name: k, value: v } })
    );
    setShowItemDropdown(false);
  };

  const handleCustomerSearch = (index, value) => {
    onItemChange(index, { target: { name: "customerName", value } });
    if (!value) { 
      setShowCustomerDropdown(false); 
      return; 
    }
    const f = customers.filter(c => 
      (c.customerName || "").toLowerCase().includes(value.toLowerCase()) ||
      (c.customerCode || "").toLowerCase().includes(value.toLowerCase())
    );
    if (f.length) { 
      setFilteredCustomers(f); 
      setShowCustomerDropdown(true); 
      setActiveIdx(index);
      setActiveField('customer');
    } else { 
      setShowCustomerDropdown(false); 
    }
  };

  const handleCustomerSelect = (index, customer) => {
    onItemChange(index, { target: { name: "customer", value: customer._id } });
    onItemChange(index, { target: { name: "customerCode", value: customer.customerCode } });
    onItemChange(index, { target: { name: "customerName", value: customer.customerName } });
    onItemChange(index, { target: { name: "contactPerson", value: customer.contactPersonName || customer.contactPerson || "" } });
    setShowCustomerDropdown(false);
  };

  const handleFieldChange = (index, field, value) => {
    const v = isNaN(parseFloat(value)) ? 0 : parseFloat(value);
    const u = { ...items[index], [field]: v };
    const c = computeItemValues(u);
    Object.entries({ ...u, ...c }).forEach(([k, val]) => 
      onItemChange(index, { target: { name: k, value: val } })
    );
  };

  const handleTaxChange = (index, value) => {
    const u = { ...items[index], taxOption: value };
    if (value === "IGST" && !u.igstRate) u.igstRate = u.gstRate || 0;
    const c = computeItemValues(u);
    Object.entries({ ...u, ...c }).forEach(([k, v]) => 
      onItemChange(index, { target: { name: k, value: v } })
    );
  };

  const handleWhSearch = (index, value) => {
    onItemChange(index, { target: { name: "warehouseName", value } });
    if (value) {
      setFilteredWarehouses(warehouses.filter(w =>
        (w.warehouseName || "").toLowerCase().includes(value.toLowerCase()) ||
        (w.warehouseCode || "").toLowerCase().includes(value.toLowerCase())
      ));
      setShowWhDropdown(true);
      setActiveIdx(index);
      setActiveField('warehouse');
    } else {
      setShowWhDropdown(false);
    }
  };

  const handleWhSelect = (index, wh) => {
    onItemChange(index, { target: { name: "warehouse", value: wh._id } });
    onItemChange(index, { target: { name: "warehouseName", value: wh.warehouseName } });
    onItemChange(index, { target: { name: "warehouseCode", value: wh.warehouseCode } });
    setShowWhDropdown(false);
  };

  const toggleExpand = (index) => setExpandedRow(prev => prev === index ? null : index);

  const inp = (ro = false) =>
    `w-full px-3 py-2 rounded-lg border text-sm transition-all outline-none
     ${ro ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed" : "border-gray-200 bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"}`;

  const Lbl = ({ t }) => <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">{t}</p>;

  return (
    <div className="space-y-4" ref={dropdownRef}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr className="border-b border-gray-200">
              <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase w-12">#</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase w-56">Customer</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase w-16">Image</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase w-24">Code</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase">Item Name</th>
              <th className="px-3 py-3 text-right text-xs font-bold text-gray-500 uppercase w-20">Qty</th>
              <th className="px-3 py-3 text-right text-xs font-bold text-gray-500 uppercase w-28">Unit Price</th>
              <th className="px-3 py-3 text-right text-xs font-bold text-gray-500 uppercase w-28">Discount</th>
              <th className="px-3 py-3 text-right text-xs font-bold text-gray-500 uppercase w-28">Total</th>
              <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase w-24">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item, index) => (
              <Fragment key={index}>
                <tr className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-3">
                    <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center">
                      {index + 1}
                    </span>
                  </td>
                  
                  <td className="px-3 py-2 relative">
                    <div className="relative">
                      <FaUser className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs z-10" />
                      <input
                        className={`${inp()} pl-9 pr-3`}
                        type="text"
                        value={item.customerName || ""}
                        onChange={e => handleCustomerSearch(index, e.target.value)}
                        placeholder="Select customer..."
                      />
                    </div>
                    {showCustomerDropdown && activeIdx === index && activeField === 'customer' && filteredCustomers.length > 0 && (
                      <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 w-80 max-h-64 overflow-y-auto shadow-xl rounded-lg z-[9999]">
                        {filteredCustomers.map(cust => (
                          <div key={cust._id} onClick={() => handleCustomerSelect(index, cust)}
                            className="px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b border-gray-100 last:border-0 transition-colors">
                            <p className="font-semibold text-gray-800 text-sm">{cust.customerName}</p>
                            <p className="text-xs text-gray-500">{cust.customerCode}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  
                  <td className="px-3 py-2">
                    <ItemImage src={item.imageUrl} alt={item.itemName} className="w-12 h-12" />
                  </td>
                  
                  <td className="px-3 py-2">
                    <input
                      className={inp()}
                      type="text"
                      value={item.itemCode || ""}
                      onChange={e => onItemChange(index, { target: { name: "itemCode", value: e.target.value } })}
                      placeholder="Code"
                    />
                  </td>
                  
                  <td className="px-3 py-2 relative">
                    <div className="relative">
                      <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs z-10" />
                      <input
                        className={`${inp()} pl-9 pr-3`}
                        type="text"
                        value={item.itemName || ""}
                        onChange={e => handleItemSearch(index, e.target.value)}
                        placeholder="Search item..."
                      />
                    </div>
                    {showItemDropdown && activeIdx === index && activeField === 'item' && filteredItems.length > 0 && (
                      <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 w-96 max-h-64 overflow-y-auto shadow-xl rounded-lg z-[9999]">
                        {filteredItems.map(itm => (
                          <div key={itm._id} onClick={() => handleItemSelect(index, itm)}
                            className="flex items-center gap-3 p-3 hover:bg-indigo-50 cursor-pointer border-b border-gray-100 last:border-0 transition-colors">
                            <ItemImage src={itm.imageUrl} alt={itm.itemName} className="w-12 h-12" />
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-800 text-sm truncate">{itm.itemName}</p>
                              <p className="text-xs text-gray-500">{itm.itemCode}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-emerald-600">₹{itm.unitPrice}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      className={inp()}
                      value={item.quantity || 0}
                      onChange={e => handleFieldChange(index, "quantity", e.target.value)}
                    />
                  </td>
                  
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      className={inp()}
                      value={item.unitPrice || 0}
                      onChange={e => handleFieldChange(index, "unitPrice", e.target.value)}
                    />
                  </td>
                  
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      className={inp()}
                      value={item.discount || 0}
                      onChange={e => handleFieldChange(index, "discount", e.target.value)}
                    />
                  </td>
                  
                  <td className="px-3 py-2">
                    <div className="px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-right">
                      ₹{(item.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  </td>
                  
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleExpand(index)}
                        className="p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-colors"
                        title="Edit details"
                      >
                        <FaEdit className="text-xs" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveItem(index)}
                        className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-colors"
                        title="Remove item"
                      >
                        <FaTrash className="text-xs" />
                      </button>
                    </div>
                  </td>
                </tr>
                
                {expandedRow === index && (
                  <tr className="bg-indigo-50/30">
                    <td colSpan={10} className="p-4">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-indigo-900">Item Details - {item.itemName || `Item ${index + 1}`}</h4>
                          <button onClick={() => setExpandedRow(null)} className="text-gray-400 hover:text-red-500">
                            <FaTimes />
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Lbl t="Description" />
                            <textarea
                              className={inp()}
                              rows="3"
                              value={item.itemDescription || ""}
                              onChange={e => onItemChange(index, { target: { name: "itemDescription", value: e.target.value } })}
                              placeholder="Item description"
                            />
                          </div>
                          
                          <div>
                            <Lbl t="Tax Type" />
                            <select
                              className={inp()}
                              value={item.taxOption || "GST"}
                              onChange={e => handleTaxChange(index, e.target.value)}
                            >
                              <option value="GST">GST</option>
                              <option value="IGST">IGST</option>
                            </select>
                          </div>
                          
                          <div>
                            <Lbl t="GST/IGST Rate (%)" />
                            <input
                              type="number"
                              step="0.1"
                              className={inp()}
                              value={item.gstRate || 0}
                              onChange={e => {
                                const u = { ...items[index], gstRate: parseFloat(e.target.value) || 0 };
                                const c = computeItemValues(u);
                                Object.entries({ ...u, ...c }).forEach(([k, v]) => 
                                  onItemChange(index, { target: { name: k, value: v } })
                                );
                              }}
                            />
                          </div>
                          
                          <div>
                            <Lbl t="Freight" />
                            <input
                              type="number"
                              className={inp()}
                              value={item.freight || 0}
                              onChange={e => handleFieldChange(index, "freight", e.target.value)}
                            />
                          </div>
                          
                          <div className="md:col-span-2">
                            <Lbl t="Warehouse (Optional)" />
                            <div className="relative">
                              <FaWarehouse className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs z-10" />
                              <input
                                className={`${inp()} pl-9`}
                                type="text"
                                value={item.warehouseName || ""}
                                onChange={e => handleWhSearch(index, e.target.value)}
                                placeholder="Search warehouse..."
                              />
                              {showWhDropdown && activeIdx === index && activeField === 'warehouse' && filteredWarehouses.length > 0 && (
                                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 w-full max-h-48 overflow-y-auto shadow-xl rounded-lg z-[9999]">
                                  {filteredWarehouses.map(wh => (
                                    <div key={wh._id} onClick={() => handleWhSelect(index, wh)}
                                      className="flex items-center gap-2 px-3 py-2 hover:bg-indigo-50 cursor-pointer border-b border-gray-100">
                                      <FaWarehouse className="text-gray-400 text-xs" />
                                      <div>
                                        <p className="font-semibold text-gray-800 text-sm">{wh.warehouseName}</p>
                                        <p className="text-xs text-gray-500">{wh.warehouseCode}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {items.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <FaBoxOpen className="text-4xl text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No items added yet. Click below to add your first item.</p>
        </div>
      )}

      <button
        type="button"
        onClick={onAddItem}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-gray-300 text-indigo-600 font-semibold text-sm hover:border-indigo-400 hover:bg-indigo-50 transition-all"
      >
        <FaPlus className="text-xs" /> Add Item
      </button>
    </div>
  );
};

ItemSection.propTypes = {
  items: PropTypes.array.isRequired,
  onItemChange: PropTypes.func.isRequired,
  onAddItem: PropTypes.func.isRequired,
  onRemoveItem: PropTypes.func.isRequired,
};

export default ItemSection;