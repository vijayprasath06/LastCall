const request = require('supertest');
const db = require('../src/config/db');
const app = require('../src/app'); // Assume app is exported from app.js without calling listen()

describe('ACID Claim Concurrency', () => {
  let testDealId;
  let testVendorId;
  let testUsers = [];

  beforeAll(async () => {
    // Clear test tables or run specific seeds here if needed
    // Create a mock vendor and deal
    const [vendorUser] = await db('users').insert({
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Test Vendor',
      email: 'vendor@test.com',
      password_hash: 'hash',
      role: 'vendor',
      date_of_birth: '1990-01-01',
      location_consent: true,
      current_location: db.raw("ST_SetSRID(ST_MakePoint(80.27, 13.08), 4326)")
    }).returning('id');

    const [vendor] = await db('vendors').insert({
      id: '00000000-0000-0000-0000-000000000002',
      user_id: vendorUser.id,
      business_name: 'Test Business',
      business_type: 'restaurant',
      verified_address: '123 Test St',
      verified_location: db.raw("ST_SetSRID(ST_MakePoint(80.27, 13.08), 4326)"),
      is_verified: true
    }).returning('id');
    testVendorId = vendor.id;

    const [deal] = await db('deals').insert({
      id: '00000000-0000-0000-0000-000000000003',
      vendor_id: testVendorId,
      title: '5-Item Test Deal',
      items: JSON.stringify([{ name: 'Test', quantity: 5 }]),
      original_price: 100,
      start_price: 50,
      min_rescue_price: 10,
      total_quantity: 5,
      claimed_quantity: 0,
      status: 'ACTIVE',
      expires_at: new Date(Date.now() + 600000), // 10 mins
      deal_location: db.raw("ST_SetSRID(ST_MakePoint(80.27, 13.08), 4326)"),
      effective_radius_meters: 2000
    }).returning('id');
    testDealId = deal.id;

    // Create 50 mock users for concurrent claiming
    for (let i = 0; i < 50; i++) {
      const [u] = await db('users').insert({
        id: `00000000-0000-0000-0000-100000000${i.toString().padStart(3, '0')}`,
        name: `User ${i}`,
        email: `user${i}@test.com`,
        password_hash: 'hash',
        role: 'consumer',
        date_of_birth: '1995-01-01'
      }).returning('id');
      testUsers.push(u.id);
    }
  });

  afterAll(async () => {
    // Cleanup
    await db('claims').where('deal_id', testDealId).del();
    await db('deals').where('id', testDealId).del();
    await db('vendors').where('id', testVendorId).del();
    await db('users').whereIn('id', testUsers).del();
    await db('users').where('id', '00000000-0000-0000-0000-000000000001').del();
    await db.destroy();
  });

  test('Should handle 50 concurrent claims on a 5-item deal properly', async () => {
    // In actual unit test, we'd mock the auth token, but let's call the controller function directly 
    // or through the express app if mock tokens are set up.
    // For this demonstration, we'll invoke the DB transaction directly to test the ACID CTE query.
    
    const claimRequests = testUsers.map(async (userId) => {
      try {
        const result = await db.raw(`
          WITH claim_lock AS (
            UPDATE deals
            SET claimed_quantity = claimed_quantity + 1,
                status = CASE WHEN (claimed_quantity + 1) >= total_quantity THEN 'CLAIMED' ELSE 'PARTIALLY_CLAIMED' END
            WHERE id = ? AND status IN ('ACTIVE', 'PARTIALLY_CLAIMED') AND claimed_quantity < total_quantity
            RETURNING id, claimed_quantity, total_quantity, expires_at
          )
          INSERT INTO claims (deal_id, user_id, qr_token, qr_expires_at, confirmed_at)
          SELECT ?, ?, gen_random_uuid()::text,
                 LEAST(NOW() + INTERVAL '20 minutes', cl.expires_at - INTERVAL '5 minutes'), NOW()
          FROM claim_lock cl RETURNING *;
        `, [testDealId, testDealId, userId]);
        
        return result.rows.length > 0 ? 201 : 409;
      } catch (err) {
        if (err.code === '23505') return 409; // Unique violation (deal_id, user_id)
        throw err;
      }
    });

    const results = await Promise.all(claimRequests);
    
    const successes = results.filter(status => status === 201).length;
    const conflicts = results.filter(status => status === 409).length;

    expect(successes).toBe(5);
    expect(conflicts).toBe(45);

    // Verify DB state
    const dealState = await db('deals').where({ id: testDealId }).first();
    expect(dealState.claimed_quantity).toBe(5);
    expect(dealState.status).toBe('CLAIMED');
  });
});
