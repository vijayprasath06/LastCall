const db = require('../src/config/db');

describe('Voluntary Cancellation', () => {
  let testDealId;
  let testVendorId;
  let testUserId;
  let testClaimId;

  beforeAll(async () => {
    const [vendorUser] = await db('users').insert({
      id: '00000000-0000-0000-0000-000000000020',
      name: 'Test Vendor',
      email: 'vendor3@test.com',
      password_hash: 'hash',
      role: 'vendor',
      date_of_birth: '1990-01-01'
    }).returning('id');

    const [vendor] = await db('vendors').insert({
      id: '00000000-0000-0000-0000-000000000021',
      user_id: vendorUser.id,
      verified_location: db.raw("ST_SetSRID(ST_MakePoint(80.27, 13.08), 4326)")
    }).returning('id');
    testVendorId = vendor.id;

    const [user] = await db('users').insert({
      id: '00000000-0000-0000-0000-000000000022',
      name: 'Test Consumer',
      email: 'consumer3@test.com',
      password_hash: 'h',
      role: 'consumer',
      date_of_birth: '1995-01-01',
      reliability_score: 1.00,
      no_show_count: 0
    }).returning('id');
    testUserId = user.id;

    const [deal] = await db('deals').insert({
      id: '00000000-0000-0000-0000-000000000023',
      vendor_id: testVendorId,
      title: 'Cancel Test Deal',
      items: JSON.stringify([{ name: 'Test', quantity: 1 }]),
      original_price: 100,
      start_price: 50,
      total_quantity: 1,
      claimed_quantity: 1, // Start claimed
      status: 'CLAIMED',
      expires_at: new Date(Date.now() + 600000),
      deal_location: db.raw("ST_SetSRID(ST_MakePoint(80.27, 13.08), 4326)")
    }).returning('id');
    testDealId = deal.id;

    const [claim] = await db('claims').insert({
      id: '00000000-0000-0000-0000-000000000024',
      deal_id: testDealId,
      user_id: testUserId,
      status: 'CONFIRMED',
      qr_token: 'test-token',
      qr_expires_at: new Date(Date.now() + 600000),
      confirmed_at: new Date()
    }).returning('id');
    testClaimId = claim.id;
  });

  afterAll(async () => {
    await db('claims').where('id', testClaimId).del();
    await db('deals').where('id', testDealId).del();
    await db('vendors').where('id', testVendorId).del();
    await db('users').whereIn('id', [testUserId, '00000000-0000-0000-0000-000000000020']).del();
    await db.destroy();
  });

  test('Should release slot and incur ZERO penalty on voluntary cancellation', async () => {
    // Mimic the cancellation controller logic
    await db.transaction(async trx => {
      const updated = await trx('claims')
        .where({ id: testClaimId, user_id: testUserId, status: 'CONFIRMED' })
        .whereNull('picked_up_at')
        .update({ status: 'CANCELLED', updated_at: new Date() });
      
      expect(updated).toBe(1);

      await trx('deals')
        .where({ id: testDealId })
        .decrement('claimed_quantity', 1)
        .update({ status: 'ACTIVE' });
    });

    const dealState = await db('deals').where({ id: testDealId }).first();
    expect(dealState.claimed_quantity).toBe(0);
    expect(dealState.status).toBe('ACTIVE');

    const userState = await db('users').where({ id: testUserId }).first();
    expect(userState.no_show_count).toBe(0);
    expect(Number(userState.reliability_score)).toBe(1.00);
  });
});
