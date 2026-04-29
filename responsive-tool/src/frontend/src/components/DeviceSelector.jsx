import { useState, useMemo } from "react";

const DEVICE_OPTIONS = [
  { id: "iphone_4", name: "iPhone 4", category: "Mobile", icon: "📱", width: 320, height: 480 },
  { id: "iphone_5_se", name: "iPhone 5/SE", category: "Mobile", icon: "📱", width: 320, height: 568 },
  { id: "iphone_se_gen2", name: "iPhone SE (2nd)", category: "Mobile", icon: "📱", width: 375, height: 667 },
  { id: "iphone_6_7_8", name: "iPhone 6/7/8", category: "Mobile", icon: "📱", width: 375, height: 667 },
  { id: "iphone_6_7_8_plus", name: "iPhone 6/7/8 Plus", category: "Mobile", icon: "📱", width: 414, height: 736 },
  { id: "iphone_x_xs", name: "iPhone X/XS", category: "Mobile", icon: "📱", width: 375, height: 812 },
  { id: "iphone_xr_11", name: "iPhone XR/11", category: "Mobile", icon: "📱", width: 414, height: 896 },
  { id: "iphone_12_13_pro", name: "iPhone 12/13 Pro", category: "Mobile", icon: "📱", width: 390, height: 844 },
  { id: "iphone_13_pro_max", name: "iPhone 13 Pro Max", category: "Mobile", icon: "📱", width: 428, height: 926 },
  { id: "iphone_14", name: "iPhone 14", category: "Mobile", icon: "📱", width: 390, height: 844 },
  { id: "iphone_14_pro", name: "iPhone 14 Pro", category: "Mobile", icon: "📱", width: 393, height: 852 },
  { id: "iphone_14_pro_max", name: "iPhone 14 Pro Max", category: "Mobile", icon: "📱", width: 430, height: 932 },
  { id: "iphone_15", name: "iPhone 15", category: "Mobile", icon: "📱", width: 393, height: 852 },
  { id: "iphone_15_pro_max", name: "iPhone 15 Pro Max", category: "Mobile", icon: "📱", width: 430, height: 932 },
  { id: "iphone_16", name: "iPhone 16", category: "Mobile", icon: "📱", width: 393, height: 852 },
  { id: "iphone_16_pro_max", name: "iPhone 16 Pro Max", category: "Mobile", icon: "📱", width: 430, height: 932 },
  { id: "ipad_mini", name: "iPad Mini", category: "Tablet", icon: "📟", width: 768, height: 1024 },
  { id: "ipad_air", name: "iPad Air", category: "Tablet", icon: "📟", width: 820, height: 1180 },
  { id: "ipad_pro_11", name: "iPad Pro 11\"", category: "Tablet", icon: "📟", width: 834, height: 1194 },
  { id: "ipad_pro_12", name: "iPad Pro 12.9\"", category: "Tablet", icon: "📟", width: 1024, height: 1366 },
  { id: "ipad_pro_m4", name: "iPad Pro M4", category: "Tablet", icon: "📟", width: 1152, height: 1536 },
  { id: "pixel_5", name: "Pixel 5", category: "Mobile", icon: "🤖", width: 393, height: 851 },
  { id: "pixel_6", name: "Pixel 6", category: "Mobile", icon: "🤖", width: 412, height: 915 },
  { id: "pixel_7", name: "Pixel 7", category: "Mobile", icon: "🤖", width: 412, height: 915 },
  { id: "pixel_7_pro", name: "Pixel 7 Pro", category: "Mobile", icon: "🤖", width: 412, height: 915 },
  { id: "pixel_8", name: "Pixel 8", category: "Mobile", icon: "🤖", width: 412, height: 915 },
  { id: "pixel_8_pro", name: "Pixel 8 Pro", category: "Mobile", icon: "🤖", width: 448, height: 998 },
  { id: "pixel_9", name: "Pixel 9", category: "Mobile", icon: "🤖", width: 412, height: 915 },
  { id: "pixel_fold", name: "Pixel Fold", category: "Mobile", icon: "🤖", width: 734, height: 1014 },
  { id: "samsung_s8_plus", name: "Galaxy S8+", category: "Mobile", icon: "📱", width: 360, height: 740 },
  { id: "samsung_s20_ultra", name: "Galaxy S20 Ultra", category: "Mobile", icon: "📱", width: 412, height: 915 },
  { id: "samsung_s21", name: "Galaxy S21", category: "Mobile", icon: "📱", width: 360, height: 800 },
  { id: "samsung_s22_ultra", name: "Galaxy S22 Ultra", category: "Mobile", icon: "📱", width: 412, height: 915 },
  { id: "samsung_s23", name: "Galaxy S23", category: "Mobile", icon: "📱", width: 360, height: 780 },
  { id: "samsung_s24_ultra", name: "Galaxy S24 Ultra", category: "Mobile", icon: "📱", width: 412, height: 915 },
  { id: "galaxy_fold_5", name: "Galaxy Z Fold 5", category: "Mobile", icon: "📱", width: 344, height: 882 },
  { id: "macbook_pro_14", name: "MacBook Pro 14\"", category: "Desktop", icon: "💻", width: 1512, height: 982 },
  { id: "macbook_pro_16", name: "MacBook Pro 16\"", category: "Desktop", icon: "💻", width: 1728, height: 1117 },
  { id: "macbook_air", name: "MacBook Pro 1440", category: "Desktop", icon: "💻", width: 1440, height: 900 },
  { id: "generic_desktop", name: "Generic Desktop", category: "Desktop", icon: "🖥️", width: 1920, height: 1080 },
];

export default function DeviceSelector({ selectedDevices, onToggle }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredOptions = useMemo(() => {
    return DEVICE_OPTIONS.filter(d => 
      d.name.toLowerCase().includes(search.toLowerCase()) || 
      d.category.toLowerCase().includes(search.toLowerCase())
    );
  }, [search]);

  const categories = ["Mobile", "Tablet", "Desktop"];

  return (
    <div className="device-selector-dropdown">
      <button 
        type="button" 
        className={`btn-selector-toggle ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="icon">📱</span>
        <span>Select Devices ({selectedDevices.length})</span>
        <span className="chevron">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="selector-panel shadow-lg">
          <div className="panel-header">
            <input 
              type="text" 
              placeholder="Search devices..." 
              className="search-input-small"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="panel-body">
            {categories.map(cat => {
              const catOptions = filteredOptions.filter(o => o.category === cat);
              if (catOptions.length === 0) return null;
              return (
                <div key={cat} className="panel-category">
                  <h4 className="category-title">{cat}</h4>
                  <div className="chips-grid">
                    {catOptions.map(device => (
                      <label key={device.id} className={`chip-option ${selectedDevices.includes(device.id) ? 'active' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selectedDevices.includes(device.id)}
                          onChange={() => onToggle(device.id)}
                          className="hidden-checkbox"
                        />
                        <span className="chip-name">{device.name}</span>
                        <span className="chip-res">{device.width}×{device.height}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="panel-footer">
            <button className="btn-primary btn-sm" onClick={() => setIsOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
