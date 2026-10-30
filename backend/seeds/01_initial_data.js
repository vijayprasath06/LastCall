/**
 * Seed 01: Initial Development Data
 *
 * Seeds realistic Chennai-based food vendor data with:
 * - 1 admin user
 * - 5 verified vendors across different Chennai localities
 * - 5 consumers at varying distances from vendors (to test radius matching)
 * - 3 active deals with Dutch Auction pricing
 *
 * Run: knex seed:run
 */

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

exports.seed = async function (knex) {
  // Clean in reverse FK dependency order
  await knex('vendor_analytics').del();
  await knex('claims').del();
  await knex('deals').del();
  await knex('vendors').del();
  await knex('users').del();

  const hashedPassword = await bcrypt.hash('Test@1234', 10);
  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  const inTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const in90Mins = new Date(now.getTime() + 90 * 60 * 1000);

  // ─── Admin User ─────────────────────────────────────────────────────────────
  const adminId = uuidv4();
  await knex.raw(`
    INSERT INTO users (id, name, email, password_hash, role, date_of_birth, data_processing_consent)
    VALUES (?, ?, ?, ?, 'admin', '1990-01-01', true)
  `, [adminId, 'Admin EGPP', 'admin@egpp.app', hashedPassword]);

  // ─── Vendor Users ─────────────────────────────────────────────────────────
  const vendorUsers = [
    { id: uuidv4(), name: 'Ravi Kumar',    email: 'ravi@ovenfresh.in',   dob: '1985-03-15' },
    { id: uuidv4(), name: 'Priya Sharma',  email: 'priya@annalakshmi.in', dob: '1980-07-22' },
    { id: uuidv4(), name: 'Sundar Raj',    email: 'sundar@srimurugan.in', dob: '1978-11-05' },
    { id: uuidv4(), name: 'Meena Das',     email: 'meena@frenchcafe.in',  dob: '1990-02-14' },
    { id: uuidv4(), name: 'Karthik Nair',  email: 'karthik@mybakery.in',  dob: '1988-09-30' },
  ];

  for (const u of vendorUsers) {
    await knex.raw(`
      INSERT INTO users (id, name, email, password_hash, role, date_of_birth, data_processing_consent)
      VALUES (?, ?, ?, ?, 'vendor', ?, true)
    `, [u.id, u.name, u.email, hashedPassword, u.dob]);
  }

  // ─── Consumer Users ─────────────────────────────────────────────────────────
  // Located at varying distances from T. Nagar (near vendor 1) for geofencing tests
  // T. Nagar center: lat=13.0418, lng=80.2341
  const consumerUsers = [
    { id: uuidv4(), name: 'Anita R.',   email: 'anita@gmail.com',   lat: 13.0430, lng: 80.2355, dist: '300m'  },
    { id: uuidv4(), name: 'Bala K.',    email: 'bala@gmail.com',    lat: 13.0520, lng: 80.2410, dist: '1.2km' },
    { id: uuidv4(), name: 'Deepa M.',   email: 'deepa@gmail.com',   lat: 13.0650, lng: 80.2500, dist: '2.5km' },
    { id: uuidv4(), name: 'Ganesh P.',  email: 'ganesh@gmail.com',  lat: 13.0800, lng: 80.2600, dist: '5km'   },
    { id: uuidv4(), name: 'Harini S.', email: 'harini@gmail.com',  lat: 13.1000, lng: 80.2800, dist: '8km'   },
  ];

  for (const u of consumerUsers) {
    await knex.raw(`
      INSERT INTO users (
        id, name, email, password_hash, role, date_of_birth,
        current_location, location_updated_at,
        location_consent, data_processing_consent, notifications_enabled
      )
      VALUES (
        ?, ?, ?, ?, 'consumer', '1998-06-20',
        ST_SetSRID(ST_MakePoint(?, ?), 4326),
        NOW(),
        true, true, true
      )
    `, [u.id, u.name, u.email, hashedPassword, u.lng, u.lat]);
  }

  // ─── Vendor Profiles ──────────────────────────────────────────────────────
  // Real Chennai localities with verified GPS coordinates
  const vendorProfiles = [
    {
      id: uuidv4(),
      user_id: vendorUsers[0].id,
      business_name: 'OvenFresh Bakery',
      business_type: 'bakery',
      verified_address: '45 Usman Road, T. Nagar, Chennai - 600017',
      lat: 13.0418, lng: 80.2341,
      city: 'Chennai', pincode: '600017',
      city_density_tier: 'metro',
      opening_time: '07:00', closing_time: '21:00',
    },
    {
      id: uuidv4(),
      user_id: vendorUsers[1].id,
      business_name: 'Annalakshmi Sweets',
      business_type: 'sweet_shop',
      verified_address: '12 Cathedral Road, Gopalapuram, Chennai - 600086',
      lat: 13.0546, lng: 80.2544,
      city: 'Chennai', pincode: '600086',
      city_density_tier: 'metro',
      opening_time: '09:00', closing_time: '20:30',
    },
    {
      id: uuidv4(),
      user_id: vendorUsers[2].id,
      business_name: 'Sri Murugan Idly Shop',
      business_type: 'restaurant',
      verified_address: '7 Venkatanarayana Road, Adyar, Chennai - 600020',
      lat: 13.0012, lng: 80.2565,
      city: 'Chennai', pincode: '600020',
      city_density_tier: 'metro',
      opening_time: '06:00', closing_time: '22:00',
    },
    {
      id: uuidv4(),
      user_id: vendorUsers[3].id,
      business_name: 'Le Petit Café',
      business_type: 'cafe',
      verified_address: '22 Nungambakkam High Road, Chennai - 600034',
      lat: 13.0569, lng: 80.2425,
      city: 'Chennai', pincode: '600034',
      city_density_tier: 'metro',
      opening_time: '08:00', closing_time: '22:00',
    },
    {
      id: uuidv4(),
      user_id: vendorUsers[4].id,
      business_name: 'My Bakery & More',
      business_type: 'bakery',
      verified_address: '88 Anna Nagar 2nd Avenue, Chennai - 600040',
      lat: 13.0850, lng: 80.2101,
      city: 'Chennai', pincode: '600040',
      city_density_tier: 'metro',
      opening_time: '07:30', closing_time: '21:30',
    },
  ];

  for (const v of vendorProfiles) {
    await knex.raw(`
      INSERT INTO vendors (
        id, user_id, business_name, business_type,
        verified_address, verified_location, city, pincode, city_density_tier,
        is_verified, verification_method, verified_at,
        opening_time, closing_time,
        avg_claim_rate, avg_claim_lag_secs
      )
      VALUES (
        ?, ?, ?, ?,
        ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), ?, ?, ?,
        true, 'manual_review', NOW(),
        ?, ?,
        65.5, 420
      )
    `, [
      v.id, v.user_id, v.business_name, v.business_type,
      v.verified_address, v.lng, v.lat, v.city, v.pincode, v.city_density_tier,
      v.opening_time, v.closing_time,
    ]);
  }

  // ─── Active Deals ─────────────────────────────────────────────────────────
  // 3 live deals from different vendors to test geospatial fan-out and RUS
  const deals = [
    {
      id: uuidv4(),
      vendor_id: vendorProfiles[0].id,
      title: 'End-of-Day Pastry Bundle',
      description: 'Fresh baked croissants, muffins, and cinnamon rolls — all from today\'s morning batch.',
      items: JSON.stringify([
        { name: 'Butter Croissant',   quantity: 4, unit: 'pieces' },
        { name: 'Blueberry Muffin',   quantity: 3, unit: 'pieces' },
        { name: 'Cinnamon Roll',      quantity: 2, unit: 'pieces' },
      ]),
      dietary_tags: ['veg', 'contains_gluten', 'contains_dairy'],
      original_price: 320.00,
      start_price: 180.00,
      current_price: 150.00,
      min_rescue_price: 80.00,
      total_quantity: 3,
      claimed_quantity: 1,
      status: 'PARTIALLY_CLAIMED',
      expires_at: inOneHour,
      lat: 13.0418, lng: 80.2341,
      effective_radius_meters: 1200,
      urgency_score: 7.2,
      urgency_label: 'ACT_SOON',
    },
    {
      id: uuidv4(),
      vendor_id: vendorProfiles[1].id,
      title: 'Assorted Sweets Box',
      description: 'Ladoo, Halwa, and Barfi from today\'s fresh preparation. Best consumed today.',
      items: JSON.stringify([
        { name: 'Besan Ladoo',    quantity: 6, unit: 'pieces' },
        { name: 'Gajar Halwa',   quantity: 1, unit: 'box (500g)' },
        { name: 'Kaju Barfi',    quantity: 4, unit: 'pieces' },
      ]),
      dietary_tags: ['veg', 'contains_dairy'],
      original_price: 450.00,
      start_price: 250.00,
      current_price: 220.00,
      min_rescue_price: 120.00,
      total_quantity: 5,
      claimed_quantity: 0,
      status: 'ACTIVE',
      expires_at: inTwoHours,
      lat: 13.0546, lng: 80.2544,
      effective_radius_meters: 1200,
      urgency_score: 3.8,
      urgency_label: 'COMFORTABLE',
    },
    {
      id: uuidv4(),
      vendor_id: vendorProfiles[3].id,
      title: 'Café Closing Pack',
      description: 'Quiche slices, sandwiches and éclairs from our evening display.',
      items: JSON.stringify([
        { name: 'Spinach Quiche',   quantity: 2, unit: 'slices' },
        { name: 'Club Sandwich',    quantity: 3, unit: 'pieces' },
        { name: 'Chocolate Éclair', quantity: 4, unit: 'pieces' },
      ]),
      dietary_tags: ['veg', 'contains_gluten', 'contains_dairy'],
      original_price: 560.00,
      start_price: 300.00,
      current_price: 300.00,
      min_rescue_price: 150.00,
      total_quantity: 2,
      claimed_quantity: 0,
      status: 'ACTIVE',
      expires_at: in90Mins,
      lat: 13.0569, lng: 80.2425,
      effective_radius_meters: 1200,
      urgency_score: 5.5,
      urgency_label: 'ACT_SOON',
    },
  ];

  for (const d of deals) {
    await knex.raw(`
      INSERT INTO deals (
        id, vendor_id, title, description, items, dietary_tags,
        original_price, start_price, current_price, min_rescue_price,
        total_quantity, claimed_quantity, status, expires_at,
        deal_location, effective_radius_meters,
        urgency_score, urgency_label, rus_updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?::jsonb, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ST_SetSRID(ST_MakePoint(?, ?), 4326), ?,
        ?, ?, NOW()
      )
    `, [
      d.id, d.vendor_id, d.title, d.description, d.items, d.dietary_tags,
      d.original_price, d.start_price, d.current_price, d.min_rescue_price,
      d.total_quantity, d.claimed_quantity, d.status, d.expires_at,
      d.lng, d.lat, d.effective_radius_meters,
      d.urgency_score, d.urgency_label,
    ]);
  }

  console.log('✅ Seed 01 complete: 1 admin, 5 vendors, 5 consumers, 3 deals seeded.');
};
