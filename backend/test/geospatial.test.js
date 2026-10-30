const db = require('../src/config/db');

describe('Geospatial PostGIS Queries', () => {
  let testDealId;
  let testVendorId;
  let inRangeUsers = [];
  let outOfRangeUsers = [];

  beforeAll(async () => {
    const [vendorUser] = await db('users').insert({
      id: '00000000-0000-0000-0000-000000000010',
      name: 'Test Vendor',
      email: 'vendor2@test.com',
      password_hash: 'hash',
      role: 'vendor',
      date_of_birth: '1990-01-01',
      location_consent: true,
      current_location: db.raw("ST_SetSRID(ST_MakePoint(80.2707, 13.0827), 4326)") // Chennai center
    }).returning('id');

    const [vendor] = await db('vendors').insert({
      id: '00000000-0000-0000-0000-000000000011',
      user_id: vendorUser.id,
      business_name: 'Location Test Business',
      business_type: 'restaurant',
      verified_address: 'Chennai',
      verified_location: db.raw("ST_SetSRID(ST_MakePoint(80.2707, 13.0827), 4326)"),
      is_verified: true
    }).returning('id');
    testVendorId = vendor.id;

    const [deal] = await db('deals').insert({
      id: '00000000-0000-0000-0000-000000000012',
      vendor_id: testVendorId,
      title: 'Geo Test Deal',
      items: JSON.stringify([{ name: 'Test', quantity: 1 }]),
      original_price: 100,
      start_price: 50,
      min_rescue_price: 10,
      total_quantity: 1,
      claimed_quantity: 0,
      status: 'ACTIVE',
      expires_at: new Date(Date.now() + 600000),
      deal_location: db.raw("ST_SetSRID(ST_MakePoint(80.2707, 13.0827), 4326)"),
      effective_radius_meters: 2000 // 2km
    }).returning('id');
    testDealId = deal.id;

    // Add users in range (~400m and ~1.5km)
    // 13.0827, 80.2707 is the center
    const [u1] = await db('users').insert({
      id: '00000000-0000-0000-0000-000000000013',
      name: 'Close User',
      email: 'close@test.com',
      password_hash: 'h',
      role: 'consumer',
      date_of_birth: '1995-01-01',
      location_consent: true,
      notifications_enabled: true,
      is_flagged: false,
      location_updated_at: new Date(),
      current_location: db.raw("ST_SetSRID(ST_MakePoint(80.2737, 13.0847), 4326)") // approx 400m
    }).returning('id');
    inRangeUsers.push(u1.id);

    const [u2] = await db('users').insert({
      id: '00000000-0000-0000-0000-000000000014',
      name: 'Mid User',
      email: 'mid@test.com',
      password_hash: 'h',
      role: 'consumer',
      date_of_birth: '1995-01-01',
      location_consent: true,
      notifications_enabled: true,
      is_flagged: false,
      location_updated_at: new Date(),
      current_location: db.raw("ST_SetSRID(ST_MakePoint(80.2807, 13.0900), 4326)") // approx 1.3km
    }).returning('id');
    inRangeUsers.push(u2.id);

    // Add users out of range (3km and 6km)
    const [u3] = await db('users').insert({
      id: '00000000-0000-0000-0000-000000000015',
      name: 'Far User',
      email: 'far@test.com',
      password_hash: 'h',
      role: 'consumer',
      date_of_birth: '1995-01-01',
      location_consent: true,
      notifications_enabled: true,
      is_flagged: false,
      location_updated_at: new Date(),
      current_location: db.raw("ST_SetSRID(ST_MakePoint(80.2907, 13.1107), 4326)") // approx 3.8km
    }).returning('id');
    outOfRangeUsers.push(u3.id);
  });

  afterAll(async () => {
    await db('deals').where('id', testDealId).del();
    await db('vendors').where('id', testVendorId).del();
    await db('users').whereIn('id', [...inRangeUsers, ...outOfRangeUsers, '00000000-0000-0000-0000-000000000010']).del();
    await db.destroy();
  });

  test('ST_DWithin should correctly filter users by dynamic radius', async () => {
    const result = await db.raw(`
      SELECT u.id, u.name
      FROM deals d
      JOIN users u ON ST_DWithin(u.current_location::geography, d.deal_location::geography, d.effective_radius_meters)
      WHERE d.id = ?
        AND u.location_consent = true
        AND u.notifications_enabled = true
        AND u.is_flagged = false
        AND u.location_updated_at > NOW() - INTERVAL '15 minutes'
    `, [testDealId]);

    const returnedIds = result.rows.map(r => r.id);

    expect(returnedIds.length).toBe(2);
    expect(returnedIds).toContain(inRangeUsers[0]);
    expect(returnedIds).toContain(inRangeUsers[1]);
    expect(returnedIds).not.toContain(outOfRangeUsers[0]);
  });

  test('Should exclude users with stale location (>15 minutes)', async () => {
    // Update close user to have stale location
    await db('users').where({ id: inRangeUsers[0] }).update({
      location_updated_at: new Date(Date.now() - 20 * 60000) // 20 mins ago
    });

    const result = await db.raw(`
      SELECT u.id
      FROM deals d
      JOIN users u ON ST_DWithin(u.current_location::geography, d.deal_location::geography, d.effective_radius_meters)
      WHERE d.id = ?
        AND u.location_consent = true
        AND u.notifications_enabled = true
        AND u.is_flagged = false
        AND u.location_updated_at > NOW() - INTERVAL '15 minutes'
    `, [testDealId]);

    const returnedIds = result.rows.map(r => r.id);

    // Now only 1 user should be found (the mid user)
    expect(returnedIds.length).toBe(1);
    expect(returnedIds).not.toContain(inRangeUsers[0]);
  });
});
