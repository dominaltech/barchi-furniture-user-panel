// ============================================================================
// BARCHI FURNITURE - USER PANEL STOREFRONT & USER ACCOUNT SIGN-IN SYSTEM
// ============================================================================

const SUPABASE_URL = 'https://fyviuwmvyussvzeufuwg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dml1d212eXVzc3Z6ZXVmdXdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MTA3MTUsImV4cCI6MjEwMDk4NjcxNX0.JbpegqU_gzyp4kiUZo9yPccdqHCCalcyWLPcCABbqoc';

let _userSupabaseClient = null;
if (window.supabase && typeof window.supabase.createClient === 'function') {
  try {
    _userSupabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (err) {
    console.warn('User Supabase client init notice:', err);
  }
}

const STORAGE_KEYS = {
  CATEGORIES: 'barchi_admin_categories_v1',
  PRODUCTS: 'barchi_admin_products_v1',
  USER_ACCOUNT: 'barchi_user_account'
};

let pdCurrentSlideIdx = 0;
let pdProductImageList = [];
let _pendingRedirectUrl = 'shipping.html';

// SVG ICONS (NO EMOJIS)
const SVG_ICONS = {
  CAMERA: `<svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="vertical-align:-1px; margin-right:3px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><circle cx="12" cy="13" r="3"/></svg>`,
  LOCK: `<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="vertical-align:-2px; margin-right:4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>`,
  USER: `<svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>`,
  ZAP: `<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="vertical-align:-2px; margin-right:4px; color:var(--primary-brand);"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>`,
  SPARKLES: `<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="vertical-align:-2px; margin-right:4px; color:var(--primary-brand);"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>`
};

// DETERMINISTIC UNIQUE PRODUCT RATING GENERATOR (NEVER LESS THAN 3.0)
function getRatingForProduct(id) {
  let hash = 0;
  const str = String(id || 'prod_100');
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Generate rating strictly between 3.2 and 5.0 (Never less than 3)
  const normalized = Math.abs(hash % 19) / 10; // 0.0 to 1.8
  const rating = (3.2 + normalized).toFixed(1); // 3.2 to 5.0
  const reviews = 12 + Math.abs((hash * 11) % 175); // 12 to 187 reviews
  return { rating: parseFloat(rating), reviews };
}

// ============================================================================
// LOCAL USER ACCOUNT & SIGN IN SYSTEM
// ============================================================================

function getUserAccount() {
  try {
    const cached = localStorage.getItem(STORAGE_KEYS.USER_ACCOUNT);
    return cached ? JSON.parse(cached) : null;
  } catch (e) {
    return null;
  }
}

function saveUserAccount(name, email, phone = '') {
  const existing = getUserAccount() || {};
  const account = {
    name: (name || existing.name || '').trim(),
    email: (email || existing.email || '').trim(),
    phone: (phone || existing.phone || existing.mobile || '').trim(),
    created_at: existing.created_at || new Date().toISOString()
  };
  localStorage.setItem(STORAGE_KEYS.USER_ACCOUNT, JSON.stringify(account));
  updateHeaderAccountUI();
  return account;
}

function removeUserAccount() {
  localStorage.removeItem(STORAGE_KEYS.USER_ACCOUNT);
  updateHeaderAccountUI();
  showToast("Signed out of account");
  closeAccountProfileModal();
}

function proceedToCheckoutOrSignIn(targetUrl = 'shipping.html') {
  _pendingRedirectUrl = targetUrl;
  const account = getUserAccount();
  if (account && account.name && account.email) {
    window.location.href = targetUrl;
  } else {
    window.location.href = `login.html?redirect=${encodeURIComponent(targetUrl)}&mode=signup`;
  }
}

function handleHeaderAccountClick() {
  const account = getUserAccount();
  if (account && account.name && account.email) {
    window.location.href = 'account.html';
  } else {
    window.location.href = 'login.html';
  }
}

function updateHeaderAccountUI() {
  const account = getUserAccount();
  const accountBtns = document.querySelectorAll('.action-btn');
  accountBtns.forEach(btn => {
    if (btn.textContent && btn.textContent.includes('Account')) {
      if (account && account.name) {
        const firstName = account.name.split(' ')[0];
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7" r="4" stroke-width="2"/></svg>
          ${firstName}
        `;
        btn.title = `Signed in as ${account.name} (${account.email})`;
      } else {
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7" r="4" stroke-width="2"/></svg>
          Account
        `;
        btn.title = "Sign In / Create Account";
      }
      btn.onclick = (e) => {
        e.preventDefault();
        handleHeaderAccountClick();
      };
    }
  });
}

function openSignInModal() {
  injectAuthModalsIfNeeded();
  const backdrop = document.getElementById('signInBackdrop');
  const modal = document.getElementById('signInModal');
  if (backdrop && modal) {
    backdrop.style.display = 'block';
    modal.style.display = 'block';
  }
}

function closeSignInModal() {
  const backdrop = document.getElementById('signInBackdrop');
  const modal = document.getElementById('signInModal');
  if (backdrop && modal) {
    backdrop.style.display = 'none';
    modal.style.display = 'none';
  }
}

function openAccountProfileModal() {
  injectAuthModalsIfNeeded();
  const account = getUserAccount();
  if (!account) return;

  const nameEl = document.getElementById('accProfileName');
  const emailEl = document.getElementById('accProfileEmail');
  if (nameEl) nameEl.textContent = account.name;
  if (emailEl) emailEl.textContent = account.email;

  const backdrop = document.getElementById('accountProfileBackdrop');
  const modal = document.getElementById('accountProfileModal');
  if (backdrop && modal) {
    backdrop.style.display = 'block';
    modal.style.display = 'block';
  }
}

function closeAccountProfileModal() {
  const backdrop = document.getElementById('accountProfileBackdrop');
  const modal = document.getElementById('accountProfileModal');
  if (backdrop && modal) {
    backdrop.style.display = 'none';
    modal.style.display = 'none';
  }
}

function handleSignInSubmit(e) {
  e.preventDefault();
  const nameInput = document.getElementById('signInName');
  const emailInput = document.getElementById('signInEmail');

  if (!nameInput || !emailInput) return;

  const name = nameInput.value.trim();
  const email = emailInput.value.trim();

  if (!name || !email) {
    showToast("Please enter both User Name and Email");
    return;
  }

  saveUserAccount(name, email);
  closeSignInModal();
  showToast(`Welcome ${name}! Account saved.`);

  setTimeout(() => {
    window.location.href = _pendingRedirectUrl || 'shipping.html';
  }, 400);
}

function injectAuthModalsIfNeeded() {
  if (document.getElementById('signInModal')) return;

  const div = document.createElement('div');
  div.id = 'authModalsContainer';
  div.innerHTML = `
    <!-- SIGN IN MODAL BACKDROP -->
    <div class="modal-backdrop" id="signInBackdrop" onclick="closeSignInModal()" style="display:none; position:fixed; inset:0; background:rgba(15,23,42,0.7); backdrop-filter:blur(4px); z-index:9999;"></div>

    <!-- SIGN IN FORM MODAL -->
    <div id="signInModal" style="display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); width:92%; max-width:440px; background:#ffffff; border-radius:16px; box-shadow:0 20px 40px rgba(0,0,0,0.25); z-index:10000; padding:28px; border:1px solid #e8e2d9;">
      <button onclick="closeSignInModal()" style="position:absolute; top:16px; right:16px; background:none; border:none; font-size:22px; color:#64748b; cursor:pointer; font-weight:700;">&times;</button>

      <div style="text-align:center; margin-bottom:22px;">
        <div style="width:52px; height:52px; background:var(--bg-soft-gray, #f4efe9); border-radius:50%; display:inline-flex; align-items:center; justify-content:center; margin-bottom:12px; color:var(--primary-brand, #c97a63);">
          ${SVG_ICONS.USER}
        </div>
        <h3 style="font-family:'Playfair Display', serif; font-size:1.45rem; color:var(--primary-dark, #2d2b2a); font-weight:700;">Create Account / Sign In</h3>
        <p style="font-size:0.86rem; color:var(--text-muted, #78726d); margin-top:4px;">Enter your User Name & Email to proceed to checkout</p>
      </div>

      <form id="signInForm" onsubmit="handleSignInSubmit(event)">
        <div style="margin-bottom:16px;">
          <label style="display:block; font-size:0.82rem; font-weight:600; color:var(--primary-dark, #2d2b2a); margin-bottom:6px;">User Name *</label>
          <input type="text" id="signInName" class="form-control" required placeholder="e.g. Rahul Verma" style="width:100%; padding:11px 14px; border:1.5px solid #e2e8f0; border-radius:8px; font-size:0.92rem; font-family:inherit;">
        </div>

        <div style="margin-bottom:22px;">
          <label style="display:block; font-size:0.82rem; font-weight:600; color:var(--primary-dark, #2d2b2a); margin-bottom:6px;">Email Address *</label>
          <input type="email" id="signInEmail" class="form-control" required placeholder="name@example.com" style="width:100%; padding:11px 14px; border:1.5px solid #e2e8f0; border-radius:8px; font-size:0.92rem; font-family:inherit;">
        </div>

        <button type="submit" style="width:100%; background:var(--primary-brand, #c97a63); color:white; font-weight:700; padding:13px; border:none; border-radius:30px; font-size:0.95rem; cursor:pointer; box-shadow:0 4px 14px rgba(201,122,99,0.4); transition:all 0.2s;">
          Save Account & Proceed to Shipping
        </button>
      </form>

      <p style="font-size:0.75rem; color:var(--text-light, #a39c95); text-align:center; margin-top:18px; line-height:1.4;">
        ${SVG_ICONS.LOCK} Your account is saved locally on your device for instant future checkouts.
      </p>
    </div>

    <!-- ACCOUNT PROFILE MODAL BACKDROP -->
    <div class="modal-backdrop" id="accountProfileBackdrop" onclick="closeAccountProfileModal()" style="display:none; position:fixed; inset:0; background:rgba(15,23,42,0.7); backdrop-filter:blur(4px); z-index:9999;"></div>

    <!-- ACCOUNT PROFILE MODAL -->
    <div id="accountProfileModal" style="display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); width:92%; max-width:400px; background:#ffffff; border-radius:16px; box-shadow:0 20px 40px rgba(0,0,0,0.25); z-index:10000; padding:26px; border:1px solid #e8e2d9;">
      <button onclick="closeAccountProfileModal()" style="position:absolute; top:16px; right:16px; background:none; border:none; font-size:20px; color:#64748b; cursor:pointer;">&times;</button>

      <div style="text-align:center; margin-bottom:18px;">
        <div style="width:50px; height:50px; background:var(--primary-brand, #c97a63); color:white; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; margin-bottom:10px;">
          ${SVG_ICONS.USER}
        </div>
        <h3 id="accProfileName" style="font-family:'Playfair Display', serif; font-size:1.35rem; color:var(--primary-dark, #2d2b2a); font-weight:700;">User Profile</h3>
        <p id="accProfileEmail" style="font-size:0.86rem; color:var(--text-muted, #78726d); margin-top:2px;">user@example.com</p>
      </div>

      <div style="background:#f8fafc; padding:12px 16px; border-radius:8px; margin-bottom:20px; font-size:0.82rem; color:#475569; display:flex; align-items:center; gap:8px;">
        ${SVG_ICONS.ZAP} <strong>Instant Checkout Active</strong> (Direct to Shipping)
      </div>

      <div style="display:flex; gap:10px;">
        <button onclick="closeAccountProfileModal()" style="flex:1; background:#f1f5f9; color:#334155; font-weight:600; padding:10px; border:none; border-radius:30px; font-size:0.88rem; cursor:pointer;">Close</button>
        <button onclick="removeUserAccount()" style="flex:1; background:#ef4444; color:white; font-weight:600; padding:10px; border:none; border-radius:30px; font-size:0.88rem; cursor:pointer;">Sign Out</button>
      </div>
    </div>
  `;
  document.body.appendChild(div);
}

// ============================================================================
// ASYNC CATALOG & STOREFRONT DATA
// ============================================================================

async function getCategoriesCatalogAsync() {
  if (_userSupabaseClient) {
    try {
      const { data, error } = await _userSupabaseClient.from('categories').select('*').order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        return data;
      }
    } catch (e) {}
  }

  const cached = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }

  return [];
}

window.getCategoriesCatalogAsync = getCategoriesCatalogAsync;
window.getCategoriesAsync = getCategoriesCatalogAsync;

function extractProductImagesArray(item, fallbackItem) {
  let list = [];
  const sources = [
    item ? item.images : null,
    fallbackItem ? fallbackItem.images : null,
    item ? item.image_url : null,
    fallbackItem ? fallbackItem.image_url : null,
    item ? item.image : null,
    fallbackItem ? fallbackItem.image : null
  ];

  const parseValue = (val) => {
    if (!val) return;
    if (Array.isArray(val)) {
      val.forEach(parseValue);
    } else if (typeof val === 'string' && val.trim()) {
      let str = val.trim();
      if (str.startsWith('[') || str.startsWith('"[')) {
        try {
          let parsed = JSON.parse(str);
          if (typeof parsed === 'string') parsed = JSON.parse(parsed);
          if (Array.isArray(parsed)) parsed.forEach(parseValue);
          else if (typeof parsed === 'string') list.push(parsed.trim());
        } catch (e) {
          str.replace(/[\[\]"']/g, '').split(',').forEach(s => list.push(s.trim()));
        }
      } else if (str.includes(',')) {
        str.split(',').forEach(s => list.push(s.trim()));
      } else {
        list.push(str);
      }
    }
  };

  sources.forEach(parseValue);

  const rawDesc = (item && (item.description || item.desc)) || (fallbackItem && (fallbackItem.description || fallbackItem.desc)) || '';
  if (rawDesc.includes('<!--IMAGES:')) {
    try {
      const jsonStr = rawDesc.split('<!--IMAGES:')[1].split('-->')[0];
      const parsed = JSON.parse(jsonStr);
      parseValue(parsed);
    } catch (e) {}
  }

  const cleanList = [];
  list.forEach(u => {
    if (u && typeof u === 'string' && (u.startsWith('http') || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('images/')) && !cleanList.includes(u)) {
      cleanList.push(u);
    }
  });

  return cleanList;
}

function extractProductSpecs(item, fallbackItem) {
  const specs = {
    material: (item && item.material) || (fallbackItem && fallbackItem.material) || '',
    colour: (item && (item.colour || item.color)) || (fallbackItem && (fallbackItem.colour || fallbackItem.color)) || '',
    length: (item && item.length) || (fallbackItem && fallbackItem.length) || '',
    width: (item && item.width) || (fallbackItem && fallbackItem.width) || '',
    height: (item && item.height) || (fallbackItem && fallbackItem.height) || ''
  };

  const rawDesc = (item && item.description) || (item && item.desc) || (fallbackItem && fallbackItem.description) || (fallbackItem && fallbackItem.desc) || '';
  
  if (rawDesc.includes('<!--SPECS:')) {
    try {
      const jsonStr = rawDesc.split('<!--SPECS:')[1].split('-->')[0];
      const parsed = JSON.parse(jsonStr);
      if (parsed) {
        if (!specs.material && parsed.material) specs.material = parsed.material;
        if (!specs.colour && parsed.colour) specs.colour = parsed.colour;
        if (!specs.length && parsed.length) specs.length = parsed.length;
        if (!specs.width && parsed.width) specs.width = parsed.width;
        if (!specs.height && parsed.height) specs.height = parsed.height;
      }
    } catch (e) {}
  }

  const cleanDesc = rawDesc.split('<!--SPECS:')[0].split('<!--IMAGES:')[0].trim();
  return { specs, cleanDesc };
}

async function getProductsCatalogAsync() {
  const cachedRaw = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
  let localProducts = [];
  if (cachedRaw) {
    try { localProducts = JSON.parse(cachedRaw); } catch (e) {}
  }

  if (_userSupabaseClient) {
    try {
      const { data, error } = await _userSupabaseClient.from('products').select('*').order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        return data.map(remoteP => {
          const localP = localProducts.find(l => String(l.id) === String(remoteP.id));
          const imgs = extractProductImagesArray(remoteP, localP);
          const { specs, cleanDesc } = extractProductSpecs(remoteP, localP);
          const rInfo = getRatingForProduct(remoteP.id);

          return {
            id: remoteP.id,
            title: remoteP.name || remoteP.title || 'Furniture Item',
            category_id: remoteP.category_id || '',
            price: parseFloat(remoteP.price) || 0,
            oldPrice: Math.round((parseFloat(remoteP.price) || 0) * 1.35),
            discount: remoteP.discount || (localP ? localP.discount : ''),
            rating: remoteP.rating || rInfo.rating,
            reviews: remoteP.reviews || rInfo.reviews,
            brand: remoteP.brand || (localP ? localP.brand : ''),
            image: imgs[0] || remoteP.image_url || '',
            images: imgs,
            desc: cleanDesc || 'No description provided.',
            material: specs.material,
            colour: specs.colour,
            length: specs.length,
            width: specs.width,
            height: specs.height
          };
        });
      }
    } catch (e) {}
  }

  if (Array.isArray(localProducts) && localProducts.length > 0) {
    return localProducts.map(p => {
      const imgs = extractProductImagesArray(p, null);
      const { specs, cleanDesc } = extractProductSpecs(p, null);
      const rInfo = getRatingForProduct(p.id);

      return {
        id: p.id,
        title: p.name || p.title || 'Furniture Item',
        category_id: p.category_id || '',
        price: parseFloat(p.price) || 0,
        oldPrice: Math.round((parseFloat(p.price) || 0) * 1.35),
        discount: p.discount || '',
        rating: p.rating || rInfo.rating,
        reviews: p.reviews || rInfo.reviews,
        brand: p.brand || '',
        image: imgs[0] || p.image_url || '',
        images: imgs,
        desc: cleanDesc || 'No description provided.',
        material: specs.material,
        colour: specs.colour,
        length: specs.length,
        width: specs.width,
        height: specs.height
      };
    });
  }

  return [];
}

let products = [];
let categories = [];
let cart = JSON.parse(localStorage.getItem('barchi_cart')) || [];
let currentSlide = 0;

document.addEventListener('DOMContentLoaded', async () => {
  initPwaInstallBanner();
  registerPwaServiceWorker();
  injectAuthModalsIfNeeded();
  updateHeaderAccountUI();
  await loadStorefrontData();
  updateCartUI();
  startAutoSlider();
  setupSearchListeners();
  loadProductDetailPageIfPresent();
  loadCategoryPageIfPresent();
  loadCheckoutSummaryIfPresent();
  loadShippingAccountAutofill();
});

async function loadStorefrontData() {
  categories = await getCategoriesCatalogAsync();
  products = await getProductsCatalogAsync();

  renderUserCategories(categories, products);
  renderUserFilterTabs(categories);
  renderProducts(products);
}

function openCategoryPage(catId) {
  window.location.href = `category.html?id=${catId}`;
}

function renderUserCategories(cats, prods) {
  const catGrid = document.getElementById('userCategoryGrid');
  if (!catGrid) return;

  if (cats.length === 0) {
    catGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:48px; color:var(--text-muted); background:#f8fafc; border-radius:12px;">No categories created yet. Create categories in the Admin Panel to display them here!</div>`;
    return;
  }

  catGrid.innerHTML = cats.map(cat => {
    const count = prods.filter(p => String(p.category_id) === String(cat.id)).length;
    return `
      <div class="category-card" onclick="openCategoryPage('${cat.id}')">
        <div class="category-img-wrap">
          <img src="${cat.thumbnail_url || ''}" alt="${cat.name}" onerror="this.style.display='none'; this.parentElement.style.background='#cbd5e1';">
        </div>
        <h3>${cat.name}</h3>
        <span>${count} Product${count !== 1 ? 's' : ''}</span>
      </div>
    `;
  }).join('');
}

async function loadCategoryPageIfPresent() {
  const grid = document.getElementById('categoryPageProductGrid');
  if (!grid) return;

  const urlParams = new URLSearchParams(window.location.search);
  const catId = urlParams.get('id');

  const cats = await getCategoriesCatalogAsync();
  const prods = await getProductsCatalogAsync();

  let targetCat = cats.find(c => String(c.id) === String(catId));
  if (!targetCat && cats.length > 0) targetCat = cats[0];

  const categoryTitle = targetCat ? targetCat.name : 'Category Products';
  const categoryBannerUrl = targetCat ? targetCat.thumbnail_url : '';

  const titleEl = document.getElementById('categoryPageTitle');
  if (titleEl) titleEl.textContent = categoryTitle;

  const breadEl = document.getElementById('categoryBreadcrumbTitle');
  if (breadEl) breadEl.textContent = categoryTitle;

  const headingEl = document.getElementById('categoryGridHeading');
  if (headingEl) headingEl.textContent = targetCat ? `${targetCat.name}` : 'Products';

  const heroBanner = document.getElementById('categoryHeroBanner');
  if (heroBanner && categoryBannerUrl) {
    heroBanner.style.backgroundImage = `linear-gradient(rgba(15, 23, 42, 0.82), rgba(15, 23, 42, 0.82)), url('${categoryBannerUrl}')`;
    heroBanner.style.backgroundSize = 'cover';
    heroBanner.style.backgroundPosition = 'center';
  }

  const filteredProducts = targetCat 
    ? prods.filter(p => String(p.category_id) === String(targetCat.id))
    : prods;

  const countBadge = document.getElementById('categoryPageCountBadge');
  if (countBadge) {
    countBadge.textContent = `${filteredProducts.length} Product${filteredProducts.length !== 1 ? 's' : ''} Available`;
  }

  if (filteredProducts.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1; text-align:center; padding:64px 24px; background:#f8fafc; border-radius:16px;">
        <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="color:#94a3b8; margin-bottom:12px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
        <h3 style="font-size:1.2rem; color:var(--primary-dark); font-weight:700; margin-bottom:6px;">No Products Found in ${categoryTitle}</h3>
        <p style="color:var(--text-muted); font-size:0.9rem; max-width:400px; margin:0 auto 16px;">New hand-crafted luxury items are being added to this collection soon.</p>
        <a href="index.html#products" class="btn-primary" style="display:inline-block; text-decoration:none;">Browse All Collections</a>
      </div>
    `;
    return;
  }

  grid.innerHTML = filteredProducts.map(p => {
    return `
      <div class="product-card" onclick="openProductDetailPage('${p.id}')">
        <div class="product-thumb">
          <img src="${p.image || ''}" alt="${p.title}" onerror="this.style.display='none'; this.parentElement.style.background='#cbd5e1';">
          ${p.discount ? `<span class="discount-badge">${p.discount}</span>` : ''}
        </div>
        <div class="product-info">
          ${p.brand ? `<span class="product-brand">${p.brand}</span>` : ''}
          <h3 class="product-title">${p.title}</h3>
          <div class="product-rating">
            <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            ${p.rating} <span>(${p.reviews})</span>
          </div>
          <div class="price-row">
            <span class="current-price">₹${p.price.toLocaleString()}</span>
            ${p.oldPrice > p.price ? `<span class="old-price">₹${p.oldPrice.toLocaleString()}</span>` : ''}
          </div>
          <button class="btn-add-cart" onclick="event.stopPropagation(); addToCart('${p.id}')">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
            Add To Cart
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderUserFilterTabs(cats) {
  const tabContainer = document.getElementById('userFilterTabs');
  if (!tabContainer) return;

  let html = `<button class="tab-btn active" onclick="filterProducts('all', this)">All Collections</button>`;
  cats.forEach(c => {
    html += `<button class="tab-btn" onclick="filterProducts('${c.id}', this)">${c.name}</button>`;
  });

  tabContainer.innerHTML = html;
}

function saveState() {
  localStorage.setItem('barchi_cart', JSON.stringify(cart));
}

function renderProducts(items, containerId = 'productGrid') {
  const grid = document.getElementById(containerId);
  if(!grid) return;

  if (items.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:48px; color:var(--text-muted); background:#f8fafc; border-radius:12px;">No products added yet.</div>`;
    return;
  }

  // On homepage (productGrid), limit to max 12 items to prevent long page scrolling
  const displayItems = containerId === 'productGrid' ? items.slice(0, 12) : items;

  grid.innerHTML = displayItems.map(p => {
    const priceNum = parseFloat(p.price) || 0;
    const oldPriceNum = parseFloat(p.oldPrice || p.old_price) || 0;

    return `
      <div class="product-card" onclick="openProductDetailPage('${p.id}')">
        <div class="product-thumb">
          <img src="${p.image || p.image_url || ''}" alt="${p.title}" onerror="this.style.display='none'; this.parentElement.style.background='#cbd5e1';">
          ${p.discount ? `<span class="discount-badge">${p.discount}</span>` : ''}
        </div>
        <div class="product-info">
          ${p.brand ? `<span class="product-brand">${p.brand}</span>` : ''}
          <h3 class="product-title">${p.title}</h3>
          <div class="product-rating">
            <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            ${p.rating || '4.8'} <span>(${p.reviews || 42})</span>
          </div>
          <div class="price-row">
            <span class="current-price">₹${priceNum.toLocaleString('en-IN')}</span>
            ${oldPriceNum > priceNum ? `<span class="old-price">₹${oldPriceNum.toLocaleString('en-IN')}</span>` : ''}
          </div>
          <button class="btn-add-cart" onclick="event.stopPropagation(); addToCart('${p.id}')">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
            Add To Cart
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function openProductDetailPage(productId) {
  window.location.href = `product-detail.html?id=${productId}`;
}

async function loadProductDetailPageIfPresent() {
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('id');
  if(!productId) return;

  const catalog = await getProductsCatalogAsync();
  const cats = await getCategoriesCatalogAsync();

  const p = catalog.find(prod => String(prod.id) === String(productId));
  if(!p) return;

  const catObj = cats.find(c => String(c.id) === String(p.category_id));

  pdProductImageList = extractProductImagesArray(p, null);
  if (!pdProductImageList || pdProductImageList.length === 0) {
    pdProductImageList = p.image ? [p.image] : [];
  }

  const track = document.getElementById('pdSliderTrack');
  const prevBtn = document.getElementById('pdPrevBtn');
  const nextBtn = document.getElementById('pdNextBtn');

  if (track) {
    track.innerHTML = pdProductImageList.map(url => `
      <div style="min-width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; cursor: pointer;" onclick="openProductImageLightbox('${url}')">
        <img src="${url}" style="width: 100%; height: 100%; object-fit: cover;" alt="${p.title}" onerror="this.parentElement.style.background='#cbd5e1';">
      </div>
    `).join('');
  }

  if (pdProductImageList.length > 1) {
    if (prevBtn) prevBtn.style.display = 'flex';
    if (nextBtn) nextBtn.style.display = 'flex';
  } else {
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
  }

  initSliderTouchSupport();

  const galleryContainer = document.getElementById('pdThumbGallery');
  if (galleryContainer) {
    galleryContainer.innerHTML = '';
    galleryContainer.style.display = 'none';
  }

  pdCurrentSlideIdx = 0;
  goToProductSlide(0);

  const brandEl = document.getElementById('pdBrand');
  if (brandEl) {
    if (p.brand) {
      brandEl.textContent = p.brand;
      brandEl.style.display = 'inline-block';
    } else {
      brandEl.style.display = 'none';
    }
  }

  const titleEl = document.getElementById('pdTitle');
  if(titleEl) titleEl.textContent = p.title;

  const breadTitleEl = document.getElementById('pdBreadcrumbTitle');
  if(breadTitleEl) breadTitleEl.textContent = p.title;

  const breadCatEl = document.getElementById('pdBreadcrumbCat');
  if(breadCatEl) breadCatEl.textContent = catObj ? catObj.name : 'FURNITURE';

  const rInfo = getRatingForProduct(p.id);
  const ratingVal = p.rating || rInfo.rating;
  const reviewsVal = p.reviews || rInfo.reviews;

  const ratingEl = document.getElementById('pdRating');
  if (ratingEl) {
    ratingEl.innerHTML = `
      <svg width="16" height="16" fill="#f59e0b" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      <strong style="color:var(--primary-dark);">${ratingVal}</strong> &nbsp;<span style="color:var(--text-muted); font-size:0.88rem;">(${reviewsVal} Verified Customer Reviews)</span>
    `;
  }

  const priceEl = document.getElementById('pdPrice');
  if(priceEl) priceEl.textContent = `₹${p.price.toLocaleString()}`;

  const oldPriceEl = document.getElementById('pdOldPrice');
  if(oldPriceEl) oldPriceEl.textContent = p.oldPrice > p.price ? `₹${p.oldPrice.toLocaleString()}` : '';

  const discEl = document.getElementById('pdDiscount');
  if (discEl) {
    if (p.discount) {
      discEl.textContent = p.discount;
      discEl.style.display = 'inline-block';
    } else {
      discEl.style.display = 'none';
    }
  }

  const descEl = document.getElementById('pdDesc');
  if(descEl) descEl.textContent = p.desc || 'No description provided.';

  const matEl = document.getElementById('pdSpecMaterial');
  if(matEl) matEl.textContent = p.material || 'N/A';

  const colEl = document.getElementById('pdSpecColour');
  if(colEl) colEl.textContent = p.colour || p.color || 'N/A';

  const lenEl = document.getElementById('pdSpecLength');
  if(lenEl) lenEl.textContent = p.length || 'N/A';

  const widEl = document.getElementById('pdSpecWidth');
  if(widEl) widEl.textContent = p.width || 'N/A';

  const heiEl = document.getElementById('pdSpecHeight');
  if(heiEl) heiEl.textContent = p.height || 'N/A';

  const buyBtn = document.getElementById('btnBuyNowAction');
  if(buyBtn) {
    buyBtn.onclick = () => {
      cart = [{ id: p.id, qty: 1 }];
      saveState();
      proceedToCheckoutOrSignIn('shipping.html');
    };
  }

  const addBtn = document.getElementById('btnAddCartAction');
  if(addBtn) {
    addBtn.onclick = () => {
      addToCart(p.id);
    };
  }

  // Smoothly reveal exact clicked product without initial flash
  const wrapper = document.getElementById('productDetailWrapper');
  if (wrapper) {
    wrapper.style.opacity = '1';
  }
}

function goToProductSlide(idx) {
  if (!pdProductImageList || pdProductImageList.length === 0) return;
  pdCurrentSlideIdx = (idx + pdProductImageList.length) % pdProductImageList.length;

  const track = document.getElementById('pdSliderTrack');
  if (track) {
    track.style.transform = `translateX(-${pdCurrentSlideIdx * 100}%)`;
  }
}

function prevProductSlide() {
  if (!pdProductImageList || pdProductImageList.length === 0) return;
  if (pdProductImageList.length === 1) {
    const track = document.getElementById('pdSliderTrack');
    if (track) {
      track.style.transform = 'translateX(12px)';
      setTimeout(() => { track.style.transform = 'translateX(0)'; }, 150);
    }
    return;
  }
  goToProductSlide(pdCurrentSlideIdx - 1);
}

function nextProductSlide() {
  if (!pdProductImageList || pdProductImageList.length === 0) return;
  if (pdProductImageList.length === 1) {
    const track = document.getElementById('pdSliderTrack');
    if (track) {
      track.style.transform = 'translateX(-12px)';
      setTimeout(() => { track.style.transform = 'translateX(0)'; }, 150);
    }
    return;
  }
  goToProductSlide(pdCurrentSlideIdx + 1);
}

let pdTouchStartX = 0;
let pdTouchEndX = 0;

function initSliderTouchSupport() {
  const track = document.getElementById('pdSliderTrack');
  if (!track || track.dataset.touchInited) return;
  track.dataset.touchInited = 'true';

  track.addEventListener('touchstart', (e) => {
    if (e.changedTouches && e.changedTouches[0]) {
      pdTouchStartX = e.changedTouches[0].screenX;
    }
  }, { passive: true });

  track.addEventListener('touchend', (e) => {
    if (e.changedTouches && e.changedTouches[0]) {
      pdTouchEndX = e.changedTouches[0].screenX;
      const diff = pdTouchEndX - pdTouchStartX;
      if (Math.abs(diff) > 35) {
        if (diff < 0) nextProductSlide();
        else prevProductSlide();
      }
    }
  }, { passive: true });
}

let lbCurrentScale = 1;
let lbStartDist = 0;
let lbStartScale = 1;
let lbLastTapTime = 0;

function openProductImageLightbox(url) {
  if (!url) return;
  let modal = document.getElementById('barchiImageLightboxModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'barchiImageLightboxModal';
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.94); z-index:99999; display:flex; align-items:center; justify-content:center; padding:16px; box-sizing:border-box; backdrop-filter:blur(6px); cursor:pointer; opacity:0; transition:opacity 0.25s ease; touch-action:none;';
    
    modal.innerHTML = `
      <button class="lightbox-close-btn" onclick="closeProductImageLightbox()" style="position:absolute; top:20px; right:20px; background:rgba(255,255,255,0.22); color:#ffffff; border:none; border-radius:50%; width:44px; height:44px; font-size:28px; cursor:pointer; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px); z-index:100000; transition:all 0.2s ease;">&times;</button>
      
      <div style="position:absolute; top:20px; left:20px; display:flex; gap:8px; z-index:100000;">
        <button onclick="zoomLightboxImage(0.3); event.stopPropagation();" style="background:rgba(255,255,255,0.22); color:#fff; border:none; border-radius:50%; width:38px; height:38px; font-size:20px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px);">+</button>
        <button onclick="zoomLightboxImage(-0.3); event.stopPropagation();" style="background:rgba(255,255,255,0.22); color:#fff; border:none; border-radius:50%; width:38px; height:38px; font-size:20px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px);">-</button>
        <button onclick="resetLightboxZoom(); event.stopPropagation();" style="background:rgba(255,255,255,0.22); color:#fff; border:none; border-radius:20px; padding:0 12px; height:38px; font-size:12px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px);">Reset</button>
      </div>

      <div id="barchiLightboxImgWrap" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; overflow:hidden; touch-action:none;">
        <img id="barchiLightboxImg" src="" alt="Full Product Image" style="max-width:92vw; max-height:88vh; object-fit:contain; border-radius:12px; box-shadow:0 12px 40px rgba(0,0,0,0.6); transition:transform 0.15s ease-out; transform-origin:center center; cursor:grab;">
      </div>
    `;
    document.body.appendChild(modal);

    modal.onclick = (e) => {
      if (e.target === modal || e.target.id === 'barchiLightboxImgWrap' || e.target.classList.contains('lightbox-close-btn')) {
        closeProductImageLightbox();
      }
    };

    setupLightboxTouchZoom();
  }

  const img = document.getElementById('barchiLightboxImg');
  if (img) {
    img.src = url;
    resetLightboxZoom();
  }
  modal.style.display = 'flex';
  setTimeout(() => { modal.style.opacity = '1'; }, 10);
}

function resetLightboxZoom() {
  lbCurrentScale = 1;
  const img = document.getElementById('barchiLightboxImg');
  if (img) img.style.transform = 'scale(1)';
}

function zoomLightboxImage(delta) {
  lbCurrentScale = Math.min(Math.max(0.8, lbCurrentScale + delta), 4.0);
  const img = document.getElementById('barchiLightboxImg');
  if (img) img.style.transform = `scale(${lbCurrentScale})`;
}

function setupLightboxTouchZoom() {
  const wrap = document.getElementById('barchiLightboxImgWrap');
  const img = document.getElementById('barchiLightboxImg');
  if (!wrap || !img) return;

  wrap.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      lbStartDist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      lbStartScale = lbCurrentScale;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lbLastTapTime < 300) {
        lbCurrentScale = lbCurrentScale > 1.2 ? 1 : 2.2;
        img.style.transform = `scale(${lbCurrentScale})`;
      }
      lbLastTapTime = now;
    }
  }, { passive: true });

  wrap.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && lbStartDist > 0) {
      const dist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      const factor = dist / lbStartDist;
      lbCurrentScale = Math.min(Math.max(0.8, lbStartScale * factor), 4.0);
      img.style.transform = `scale(${lbCurrentScale})`;
    }
  }, { passive: true });

  wrap.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      lbStartDist = 0;
    }
  });
}

function closeProductImageLightbox() {
  const modal = document.getElementById('barchiImageLightboxModal');
  if (modal) {
    modal.style.opacity = '0';
    setTimeout(() => { modal.style.display = 'none'; }, 250);
  }
}

function openOrderReceiptModal(orderId) {
  const backdrop = document.getElementById('receiptBackdrop');
  const modal = document.getElementById('receiptModal');
  const headerId = document.getElementById('receiptOrderIdHeader');
  const body = document.getElementById('receiptModalBody');
  if (!modal) return;

  const savedOrders = JSON.parse(localStorage.getItem('barchi_saved_orders_v1')) || [];
  const ord = savedOrders.find(o => String(o.id) === String(orderId));

  if (headerId) headerId.textContent = `#${orderId}`;

  if (body) {
    if (!ord) {
      body.innerHTML = `
        <div style="padding:16px; background:#f8fafc; border-radius:12px; font-size:0.9rem; color:#64748b; text-align:center;">
          Order #${orderId} summary loaded.
        </div>
      `;
    } else {
      const items = Array.isArray(ord.items) ? ord.items : (typeof ord.items === 'string' ? JSON.parse(ord.items || '[]') : []);
      const totalAmt = parseFloat(ord.total_amount || ord.total || 0);

      body.innerHTML = `
        <div style="font-size:0.86rem; color:#475569; margin-bottom:12px;">
          <div><strong>Customer:</strong> ${ord.client_name || 'Barchi Customer'}</div>
          <div><strong>Mobile:</strong> ${ord.mobile_number || 'N/A'}</div>
          <div style="margin-top:4px;"><strong>Status:</strong> <span class="order-status-badge ${(ord.status || 'Pending').toLowerCase()}">${ord.status || 'Pending'}</span></div>
          <div><strong>Date:</strong> ${ord.created_at ? new Date(ord.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Recent'}</div>
        </div>

        <div style="border-top:1px solid #e2e8f0; padding-top:12px;">
          <h4 style="font-size:0.92rem; font-weight:700; margin-bottom:8px; color:#0f172a;">Ordered Items</h4>
          ${items.length === 0 ? `<div style="font-size:0.85rem; color:#64748b;">Furniture Item · Subtotal: ₹${totalAmt.toLocaleString('en-IN')}</div>` : items.map(it => `
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.86rem; padding:6px 0; border-bottom:1px dashed #f1f5f9;">
              <div>
                <strong>${it.product_name || it.title || it.name || 'Furniture Product'}</strong>
                <div style="font-size:0.78rem; color:#64748b;">Qty: ${it.qty || it.quantity || 1}</div>
              </div>
              <strong style="color:#2563eb;">₹${((parseFloat(it.price) || 0) * (parseInt(it.qty || it.quantity) || 1)).toLocaleString('en-IN')}</strong>
            </div>
          `).join('')}
        </div>

        <div style="border-top:2px solid #e2e8f0; margin-top:12px; padding-top:10px; display:flex; justify-content:space-between; align-items:center; font-weight:700; font-size:1rem; color:#0f172a;">
          <span>Total Paid:</span>
          <span style="color:#2563eb;">₹${totalAmt.toLocaleString('en-IN')}</span>
        </div>
      `;
    }
  }

  if (backdrop) backdrop.style.display = 'block';
  modal.style.display = 'block';
}

function closeOrderReceiptModal() {
  const backdrop = document.getElementById('receiptBackdrop');
  const modal = document.getElementById('receiptModal');
  if (backdrop) backdrop.style.display = 'none';
  if (modal) modal.style.display = 'none';
}

window.openOrderReceiptModal = openOrderReceiptModal;
window.closeOrderReceiptModal = closeOrderReceiptModal;

function goToSlide(index) {
  const slides = document.querySelectorAll('.hero-slider .slide');
  const dots = document.querySelectorAll('.slider-dots .dot');
  if (slides.length === 0) return;

  slides[currentSlide].classList.remove('active');
  dots[currentSlide].classList.remove('active');

  currentSlide = (index + slides.length) % slides.length;

  slides[currentSlide].classList.add('active');
  dots[currentSlide].classList.add('active');
}

function startAutoSlider() {
  if(document.querySelectorAll('.hero-slider .slide').length > 0) {
    setInterval(() => {
      goToSlide(currentSlide + 1);
    }, 5000);
  }
}

function scrollToProducts() {
  const pSection = document.getElementById('products');
  if(pSection) {
    pSection.scrollIntoView({ behavior: 'smooth' });
  }
}

async function filterProducts(category, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if(btn) btn.classList.add('active');

  const catalog = await getProductsCatalogAsync();
  if (category === 'all') {
    renderProducts(catalog);
  } else {
    const filtered = catalog.filter(p => String(p.category_id) === String(category));
    renderProducts(filtered);
  }
}

function setupSearchListeners() {
  const searchInput = document.getElementById('searchInput');
  if(searchInput) {
    searchInput.addEventListener('keyup', (e) => {
      if(e.key === 'Enter') executeSearch('searchInput');
    });
  }
  const mobileSearchInput = document.getElementById('mobileSearchInput');
  if(mobileSearchInput) {
    mobileSearchInput.addEventListener('keyup', (e) => {
      if(e.key === 'Enter') executeSearch('mobileSearchInput');
    });
  }
}

async function executeSearch(inputId) {
  const input = document.getElementById(inputId);
  if(!input) return;
  const query = input.value.toLowerCase().trim();
  if(!query) return;

  const catalog = await getProductsCatalogAsync();
  const matched = catalog.filter(p => p.title.toLowerCase().includes(query) || (p.desc && p.desc.toLowerCase().includes(query)));
  renderProducts(matched);
  scrollToProducts();
  showToast(`Found ${matched.length} matching items`);
}

function toggleMobileNav() {
  if (window.innerWidth > 768) {
    const drawer = document.getElementById('mobileNavDrawer');
    const backdrop = document.getElementById('backdrop');
    if (drawer) drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    return;
  }

  const drawer = document.getElementById('mobileNavDrawer');
  const backdrop = document.getElementById('backdrop');
  if(drawer && backdrop) {
    drawer.classList.toggle('open');
    backdrop.classList.toggle('open');
  }
}

window.addEventListener('resize', () => {
  if (window.innerWidth > 768) {
    const drawer = document.getElementById('mobileNavDrawer');
    const backdrop = document.getElementById('backdrop');
    if (drawer) drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
  }
});

function addToCart(id) {
  const p = products ? products.find(prod => String(prod.id) === String(id)) : null;
  const title = p ? (p.title || p.name || 'Furniture Item') : 'Furniture Item';
  const price = p ? (parseFloat(p.price) || 0) : 0;
  const image = p ? (p.image || p.image_url || '') : '';
  const category = p ? (p.category || 'Solid Wood Collection') : 'Solid Wood Collection';

  const existing = cart.find(item => String(item.id) === String(id));
  if(existing) {
    existing.qty += 1;
    existing.title = title;
    existing.name = title;
    existing.price = price;
    existing.image = image;
    existing.category = category;
  } else {
    cart.push({
      id,
      product_id: id,
      qty: 1,
      quantity: 1,
      title,
      name: title,
      product_name: title,
      price,
      image,
      category
    });
  }
  saveState();
  updateCartUI();
  toggleCartDrawer(true);
  showToast("Item added to Barchi Cart!");
}

function updateQty(id, delta) {
  const item = cart.find(i => String(i.id) === String(id));
  if(item) {
    item.qty += delta;
    if(item.qty <= 0) {
      cart = cart.filter(i => String(i.id) !== String(id));
    }
  }
  saveState();
  updateCartUI();
}

function updateCartUI() {
  const cartBody = document.getElementById('cartBody');
  const totalCount = cart.reduce((acc, item) => acc + item.qty, 0);
  
  const dCount = document.getElementById('cartCountDesktop');
  if(dCount) dCount.textContent = totalCount;

  const mHeaderCount = document.getElementById('cartCountMobileHeader');
  if(mHeaderCount) mHeaderCount.textContent = totalCount;

  const titleCount = document.getElementById('cartCountTitle');
  if(titleCount) titleCount.textContent = totalCount;

  if(!cartBody) return;

  if(cart.length === 0) {
    cartBody.innerHTML = '<div class="cart-empty"><p>Your bag is currently empty.</p></div>';
    if(document.getElementById('cartSubtotal')) document.getElementById('cartSubtotal').textContent = '₹0';
    if(document.getElementById('cartTotal')) document.getElementById('cartTotal').textContent = '₹0';
    return;
  }

  let subtotal = 0;
  cartBody.innerHTML = cart.map(c => {
    const p = products.find(prod => String(prod.id) === String(c.id));
    if(!p) return '';
    const itemTotal = p.price * c.qty;
    subtotal += itemTotal;

    return `
      <div class="cart-item">
        <img src="${p.image}" alt="${p.title}">
        <div class="cart-item-details">
          <div class="cart-item-title">${p.title}</div>
          <div class="cart-item-price">₹${p.price.toLocaleString()}</div>
          <div class="qty-controls">
            <button class="qty-btn" onclick="updateQty('${p.id}', -1)">-</button>
            <span style="font-size:13px; font-weight:600;">${c.qty}</span>
            <button class="qty-btn" onclick="updateQty('${p.id}', 1)">+</button>
            <button onclick="updateQty('${p.id}', -${c.qty})" style="margin-left:auto; color:var(--primary-brand); font-size:12px;">Remove</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if(document.getElementById('cartSubtotal')) document.getElementById('cartSubtotal').textContent = `₹${subtotal.toLocaleString()}`;
  if(document.getElementById('cartTotal')) document.getElementById('cartTotal').textContent = `₹${subtotal.toLocaleString()}`;
}

function toggleCartDrawer(openState) {
  const drawer = document.getElementById('cartDrawer');
  const backdrop = document.getElementById('backdrop');
  if(!drawer || !backdrop) return;

  if(openState !== undefined) {
    if(openState) {
      drawer.classList.add('open');
      backdrop.classList.add('open');
    } else {
      drawer.classList.remove('open');
      backdrop.classList.remove('open');
    }
  } else {
    drawer.classList.toggle('open');
    backdrop.classList.toggle('open');
  }
}

function closeCartDrawer() {
  toggleCartDrawer(false);
}

function startCheckoutFromCart() {
  if(cart.length === 0) {
    showToast("Please add items to cart before checkout");
    return;
  }
  closeCartDrawer();
  proceedToCheckoutOrSignIn('shipping.html');
}

function loadShippingAccountAutofill() {
  const account = getUserAccount();
  if (account) {
    const nameEl = document.getElementById('shipName');
    const emailEl = document.getElementById('shipEmail');
    const phoneEl = document.getElementById('shipPhone');
    if (nameEl && !nameEl.value && account.name) nameEl.value = account.name;
    if (emailEl && !emailEl.value && account.email) emailEl.value = account.email;
    if (phoneEl && !phoneEl.value && (account.phone || account.mobile)) phoneEl.value = account.phone || account.mobile;
  }
}

function loadCheckoutSummaryIfPresent() {
  let subtotal = 0;
  cart.forEach(c => {
    const p = products.find(prod => String(prod.id) === String(c.id));
    const price = p ? p.price : (parseFloat(c.price) || 0);
    subtotal += price * (parseInt(c.qty) || 1);
  });

  const payTotalEl = document.getElementById('paymentTotalAmount');
  if (payTotalEl) {
    payTotalEl.textContent = `₹${subtotal.toLocaleString('en-IN')}`;
  }

  const summaryContainer = document.getElementById('checkoutSummaryItems');
  if(!summaryContainer) return;

  summaryContainer.innerHTML = cart.map(c => {
    const p = products.find(prod => String(prod.id) === String(c.id));
    if(!p) return '';
    const itemPrice = p.price || parseFloat(c.price) || 0;
    return `
      <div style="display:flex; gap:12px; margin-bottom:12px; align-items:center;">
        <img src="${p.image}" style="width:48px; height:48px; object-fit:cover; border-radius:6px;">
        <div style="flex:1;">
          <h5 style="font-size:13px; font-weight:600; color:var(--primary-dark);">${p.title}</h5>
          <span style="font-size:12px; color:var(--text-muted);">Qty: ${c.qty} × ₹${itemPrice.toLocaleString()}</span>
        </div>
      </div>
    `;
  }).join('');

  if(document.getElementById('checkoutSubtotal')) document.getElementById('checkoutSubtotal').textContent = `₹${subtotal.toLocaleString('en-IN')}`;
  if(document.getElementById('checkoutTotal')) document.getElementById('checkoutTotal').textContent = `₹${subtotal.toLocaleString('en-IN')}`;
}

function handleShippingSubmit(e) {
  e.preventDefault();
  const shippingDetails = {
    name: (document.getElementById('shipName').value || '').trim(),
    phone: (document.getElementById('shipPhone').value || '').trim(),
    email: (document.getElementById('shipEmail').value || '').trim(),
    address: (document.getElementById('shipAddress').value || '').trim(),
    city: (document.getElementById('shipCity').value || '').trim(),
    state: (document.getElementById('shipState').value || '').trim(),
    pin: (document.getElementById('shipPin').value || '').trim()
  };
  localStorage.setItem('barchi_shipping', JSON.stringify(shippingDetails));

  if (shippingDetails.name && shippingDetails.email) {
    saveUserAccount(shippingDetails.name, shippingDetails.email, shippingDetails.phone);
  }

  window.location.href = 'payment.html';
}

async function generateNextOrderId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const datePrefix = `${year}/${month}/${day}/`; // e.g. "2026/08/17/"

  let maxNum = 0;

  // 1. Query Supabase for orders placed today matching this prefix
  if (_userSupabaseClient) {
    try {
      const { data, error } = await _userSupabaseClient
        .from('orders')
        .select('id')
        .like('id', `${datePrefix}%`);

      if (!error && Array.isArray(data)) {
        data.forEach(item => {
          if (item && item.id && item.id.startsWith(datePrefix)) {
            const numPart = parseInt(item.id.slice(datePrefix.length), 10);
            if (!isNaN(numPart) && numPart > maxNum) {
              maxNum = numPart;
            }
          }
        });
      }
    } catch (e) {
      console.warn('Error querying today order count from Supabase:', e);
    }
  }

  // 2. Also check local cached orders as fallback
  try {
    const cachedOrders = JSON.parse(localStorage.getItem('barchi_saved_orders_v1')) || [];
    cachedOrders.forEach(item => {
      if (item && item.id && item.id.startsWith(datePrefix)) {
        const numPart = parseInt(item.id.slice(datePrefix.length), 10);
        if (!isNaN(numPart) && numPart > maxNum) {
          maxNum = numPart;
        }
      }
    });
  } catch (e) {}

  const nextNum = maxNum + 1;
  return `${datePrefix}${nextNum}`;
}

async function handlePaymentSubmit(e) {
  e.preventDefault();
  
  const shipping = JSON.parse(localStorage.getItem('barchi_shipping')) || {};
  let totalAmount = 0;
  
  if (cart && cart.length > 0) {
    cart.forEach(c => {
      const p = products ? products.find(prod => String(prod.id) === String(c.id)) : null;
      const price = parseFloat(c.price) || (p ? parseFloat(p.price) : 0);
      const qty = parseInt(c.qty || c.quantity) || 1;
      totalAmount += price * qty;
    });
  } else {
    // Fallback if cart stored in localStorage directly
    const localCart = JSON.parse(localStorage.getItem('barchi_cart')) || [];
    localCart.forEach(c => {
      totalAmount += (parseFloat(c.price) || 0) * (parseInt(c.qty) || 1);
    });
  }

  if (totalAmount <= 0) {
    showToast('Your bag is empty. Please add items before checkout.');
    return;
  }

  // Generate Year/Month/Date/Number Order ID (starts from 1)
  const orderId = await generateNextOrderId();
  const accUser = getUserAccount();
  const clientEmail = (shipping.email || (accUser ? accUser.email : '')).trim();
  const clientName = (shipping.name || (accUser ? accUser.name : 'Barchi Customer')).trim();
  const clientPhone = (shipping.phone || (accUser ? (accUser.phone || accUser.mobile) : '+919923472964')).trim();
  const fullAddress = (shipping.address || '').trim();
  const city = (shipping.city || '').trim();
  const state = (shipping.state || '').trim();
  const pincode = (shipping.pin || '').trim();

  const enrichedItems = (cart && cart.length > 0 ? cart : (JSON.parse(localStorage.getItem('barchi_cart')) || [])).map(c => {
    const p = products ? products.find(prod => String(prod.id) === String(c.id)) : null;
    const title = c.title || c.name || (p ? (p.title || p.name) : 'Barchi Furniture Product');
    const price = c.price || (p ? p.price : 0);
    const image = c.image || (p ? p.image : '');
    const category = c.category || (p ? p.category : 'Solid Wood Collection');
    const qty = parseInt(c.qty || c.quantity) || 1;
    return {
      id: c.id,
      product_id: c.id,
      title: title,
      name: title,
      product_name: title,
      qty: qty,
      quantity: qty,
      price: price,
      image: image,
      category: category
    };
  });

  const newOrder = {
    id: orderId,
    client_name: clientName,
    client_email: clientEmail,
    mobile_number: clientPhone,
    shipping_address: fullAddress,
    city: city,
    state: state,
    pincode: pincode,
    total_amount: totalAmount,
    status: 'Pending',
    payment_status: 'Pending',
    payment_method: 'PhonePe PG',
    items: enrichedItems,
    created_at: new Date().toISOString()
  };

  // Cache pending order locally
  const cachedOrders = JSON.parse(localStorage.getItem('barchi_saved_orders_v1')) || [];
  cachedOrders.unshift(newOrder);
  localStorage.setItem('barchi_saved_orders_v1', JSON.stringify(cachedOrders));
  localStorage.setItem('barchi_order_id', orderId);
  localStorage.setItem('barchi_pending_order', JSON.stringify(newOrder));

  // Save initial record to Supabase
  if (_userSupabaseClient) {
    try {
      await _userSupabaseClient.from('orders').insert({
        id: orderId,
        client_name: clientName,
        client_email: clientEmail,
        mobile_number: clientPhone,
        shipping_address: fullAddress,
        city: city,
        state: state,
        pincode: pincode,
        total_amount: totalAmount,
        status: 'Pending',
        payment_status: 'Pending',
        payment_method: 'PhonePe PG',
        items: enrichedItems,
        created_at: new Date().toISOString()
      });
    } catch (err) {
      console.warn('Supabase initial order insert:', err);
    }
  }

  // Show Modern Animated Glassmorphic Overlay
  const overlay = document.getElementById('payLoadingOverlay');
  const modalTitle = document.getElementById('payModalTitle');
  const modalSub = document.getElementById('payModalSub');
  const submitBtn = document.getElementById('paySubmitBtn');
  const btnLabel = document.getElementById('payBtnLabel');

  if (overlay) overlay.classList.add('active');
  if (submitBtn) submitBtn.disabled = true;
  if (btnLabel) btnLabel.textContent = 'Connecting Gateway...';

  try {
    if (modalTitle) modalTitle.textContent = 'Initiating PhonePe';
    if (modalSub) modalSub.textContent = 'Creating secure 256-bit payment session...';

    const response = await fetch('/api/phonepe-create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: totalAmount,
        merchantOrderId: orderId,
        customer: {
          name: clientName,
          email: clientEmail,
          phone: clientPhone
        }
      })
    });

    const result = await response.json();

    if (result.success && result.redirectUrl) {
      if (modalTitle) modalTitle.textContent = 'Securing Connection';
      if (modalSub) modalSub.textContent = 'Redirecting to PhonePe Official Gateway...';
      
      // Smooth handoff redirect
      setTimeout(() => {
        window.location.href = result.redirectUrl;
      }, 400);
    } else {
      throw new Error(result.error || 'Failed to initiate PhonePe transaction.');
    }
  } catch (err) {
    console.error('PhonePe initiation error:', err);
    if (overlay) overlay.classList.remove('active');
    if (submitBtn) submitBtn.disabled = false;
    if (btnLabel) btnLabel.textContent = 'Pay via PhonePe / UPI';
    showToast(err.message || 'Payment initiation failed. Please try again.');
  }
}

function handleContactSubmit(e) {
  e.preventDefault();
  showToast("Thank you! Your message has been sent to Barchi Support.");
  e.target.reset();
}

function openConsultationModal() {
  window.location.href = 'contact.html';
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  if(!toast) return;
  const msgEl = document.getElementById('toastMsg');
  if (msgEl) msgEl.textContent = msg;
  else toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

// ============================================================================
// PWA INSTALLATION & SERVICE WORKER ENGINE
// ============================================================================
let pwaDeferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  pwaDeferredPrompt = e;
  initPwaInstallBanner();
});

function registerPwaServiceWorker() {
  // ServiceWorkers and Web App Manifests require HTTP/HTTPS (or localhost)
  if (!window.location.protocol.startsWith('http')) {
    return;
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Gracefully ignore local network or dev registration limits
    });
  }
}

function injectManifestIfNeeded() {
  if (window.location.protocol.startsWith('http')) {
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = 'manifest.json';
      document.head.appendChild(link);
    }
  }
}

function initPwaInstallBanner() {
  injectManifestIfNeeded();

  // If already standalone PWA mode, don't show prompt banner
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
    return;
  }

  if (document.getElementById('barchiPwaInstallBanner')) return;

  const banner = document.createElement('div');
  banner.id = 'barchiPwaInstallBanner';
  banner.className = 'pwa-install-banner';
  banner.innerHTML = `
    <img src="icon-192.png" alt="Barchi Furniture" class="pwa-banner-icon" onerror="this.src='images/barchi-logo.png';">
    <div class="pwa-banner-text">
      <h4 class="pwa-banner-title">Barchi Furniture App</h4>
      <p class="pwa-banner-desc">Install for faster luxury shopping & tracking</p>
    </div>
    <button class="pwa-install-btn" onclick="triggerPwaInstall()">
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
      Install
    </button>
    <button class="pwa-close-btn" onclick="dismissPwaBanner()" aria-label="Close Install Banner">&times;</button>
  `;
  document.body.appendChild(banner);
}

function dismissPwaBanner() {
  const banner = document.getElementById('barchiPwaInstallBanner');
  if (banner) {
    banner.style.transform = 'translateY(30px)';
    banner.style.opacity = '0';
    setTimeout(() => {
      if (banner) banner.remove();
    }, 300);
  }
}

async function triggerPwaInstall() {
  if (pwaDeferredPrompt) {
    try {
      await pwaDeferredPrompt.prompt();
      const choiceResult = await pwaDeferredPrompt.userChoice;
      if (choiceResult && choiceResult.outcome === 'accepted') {
        pwaDeferredPrompt = null;
        showToast('Thank you for installing Barchi Furniture!');
        const banner = document.getElementById('barchiPwaInstallBanner');
        if (banner) banner.remove();
      }
    } catch (err) {
      console.warn('PWA install prompt error:', err);
    }
  } else {
    // Check if iOS device (Safari has no beforeinstallprompt, requires Add to Home Screen)
    const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
    if (isIos) {
      showIosInstallGuide();
      return;
    }

    // If running directly from file:/// on local disk without a web server
    if (!window.location.protocol.startsWith('http')) {
      showLocalFileInstallNotice();
    }
  }
}

function showLocalFileInstallNotice() {
  let modal = document.getElementById('barchiLocalInstallModal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'barchiLocalInstallModal';
  modal.className = 'pwa-ios-modal-backdrop';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `
    <div class="pwa-ios-modal">
      <img src="icon-192.png" style="width:52px; height:52px; border-radius:12px; margin-bottom:12px; border:1px solid #e2e8f0;" onerror="this.src='images/barchi-logo.png';">
      <h3 style="font-family:var(--font-serif); font-size:1.2rem; color:#0f172a; margin-bottom:6px;">Barchi Furniture PWA</h3>
      <p style="font-size:0.86rem; color:#475569; line-height:1.5; margin-bottom:16px;">
        Browser security requires an HTTP/HTTPS connection (or localhost) to trigger 1-tap app installation directly on your device.
      </p>
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px; font-size:0.84rem; text-align:left; color:#334155; margin-bottom:18px;">
        Once hosted or run with a local server (e.g. <code>http://localhost</code> or <code>https://yourdomain.com</code>), clicking <strong>Install</strong> installs the app directly onto Android, iOS, Windows, or Mac.
      </div>
      <button onclick="document.getElementById('barchiLocalInstallModal').remove()" class="btn-primary" style="width:100%; justify-content:center; padding:11px; font-size:0.9rem;">Got It</button>
    </div>
  `;
  document.body.appendChild(modal);
}

// Auto-cleanup banner once app is installed
window.addEventListener('appinstalled', () => {
  pwaDeferredPrompt = null;
  const banner = document.getElementById('barchiPwaInstallBanner');
  if (banner) banner.remove();
  showToast('Barchi Furniture installed successfully!');
});

function showIosInstallGuide() {
  let modal = document.getElementById('barchiIosInstallModal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'barchiIosInstallModal';
  modal.className = 'pwa-ios-modal-backdrop';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `
    <div class="pwa-ios-modal">
      <img src="icon-192.png" style="width:52px; height:52px; border-radius:12px; margin-bottom:12px; border:1px solid #e2e8f0;" onerror="this.src='images/barchi-logo.png';">
      <h3 style="font-family:var(--font-serif); font-size:1.2rem; color:#0f172a; margin-bottom:6px;">Install Barchi Furniture</h3>
      <p style="font-size:0.85rem; color:#64748b; line-height:1.45; margin-bottom:16px;">
        Install our web app to your Home Screen for easy 1-tap access and fastest checkout.
      </p>
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px; font-size:0.84rem; text-align:left; color:#334155; margin-bottom:18px;">
        <div style="margin-bottom:10px; display:flex; align-items:center; gap:8px;">
          <span style="background:#e2e8f0; width:22px; height:22px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-weight:700; font-size:12px;">1</span>
          <span>Tap the <strong>Share</strong> button <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="#2563eb" style="vertical-align:middle; display:inline-block;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg> at the bottom of Safari.</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="background:#e2e8f0; width:22px; height:22px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-weight:700; font-size:12px;">2</span>
          <span>Scroll down & tap <strong>Add to Home Screen ➕</strong>.</span>
        </div>
      </div>
      <button onclick="document.getElementById('barchiIosInstallModal').remove()" class="btn-primary" style="width:100%; justify-content:center; padding:11px; font-size:0.9rem;">Got It</button>
    </div>
  `;
  document.body.appendChild(modal);
}

// EXPOSE UTILITIES TO WINDOW
window.proceedToCheckoutOrSignIn = proceedToCheckoutOrSignIn;
window.handleHeaderAccountClick = handleHeaderAccountClick;
window.openSignInModal = openSignInModal;
window.closeSignInModal = closeSignInModal;
window.removeUserAccount = removeUserAccount;
window.triggerPwaInstall = triggerPwaInstall;
window.dismissPwaBanner = dismissPwaBanner;


