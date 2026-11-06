// scripts/seed-price-alerts.js
// Seeds realistic, multi-crop APMC price surge alerts across oilseed value chain
// for ALL platform roles (Farmers, FPOs, Processors, Retailers, Government, Admin)
import { adminClient } from '../backend/src/config/supabaseClient.js';

const alertsTemplate = [
  {
    crop_type: 'mustard',
    variety: 'Pusa Bold',
    mandi_name: 'Morena APMC',
    district: 'Morena',
    state: 'Madhya Pradesh',
    previous_price: 5450,
    new_price: 5980,
    percentage_increase: 9.7,
    amount_increase: 530,
    priority: 'high',
    is_read: false,
    hours_ago: 0.5,
    title: 'Price Surge Alert: Mustard (+9.7%)',
    message: 'Modal price for Mustard (Pusa Bold) increased from ₹5,450/q to ₹5,980/q (+₹530/q / +9.7%) at Morena APMC, Morena.'
  },
  {
    crop_type: 'groundnut',
    variety: 'Pusa Bold',
    mandi_name: 'Rajkot APMC',
    district: 'Rajkot',
    state: 'Gujarat',
    previous_price: 6150,
    new_price: 6720,
    percentage_increase: 9.3,
    amount_increase: 570,
    priority: 'high',
    is_read: false,
    hours_ago: 1.5,
    title: 'Price Surge Alert: Groundnut (+9.3%)',
    message: 'Modal price for Groundnut (Pusa Bold) increased from ₹6,150/q to ₹6,720/q (+₹570/q / +9.3%) at Rajkot APMC, Rajkot.'
  },
  {
    crop_type: 'sunflower',
    variety: 'Pusa Bold',
    mandi_name: 'Latur APMC',
    district: 'Latur',
    state: 'Maharashtra',
    previous_price: 5100,
    new_price: 5580,
    percentage_increase: 9.4,
    amount_increase: 480,
    priority: 'high',
    is_read: false,
    hours_ago: 2.8,
    title: 'Price Surge Alert: Sunflower (+9.4%)',
    message: 'Modal price for Sunflower (Pusa Bold) increased from ₹5,100/q to ₹5,580/q (+₹480/q / +9.4%) at Latur APMC, Latur.'
  },
  {
    crop_type: 'sesame',
    variety: 'Pusa Bold',
    mandi_name: 'Unjha Mandi',
    district: 'Mehsana',
    state: 'Gujarat',
    previous_price: 12300,
    new_price: 13450,
    percentage_increase: 9.3,
    amount_increase: 1150,
    priority: 'urgent',
    is_read: false,
    hours_ago: 4.0,
    title: 'Price Surge Alert: Sesame (+9.3%)',
    message: 'Modal price for Sesame (Pusa Bold) increased from ₹12,300/q to ₹13,450/q (+₹1,150/q / +9.3%) at Unjha Mandi, Mehsana.'
  },
  {
    crop_type: 'soybean',
    variety: 'Envy',
    mandi_name: 'Indore Mandi',
    district: 'Indore',
    state: 'Madhya Pradesh',
    previous_price: 4850,
    new_price: 5287,
    percentage_increase: 9.0,
    amount_increase: 437,
    priority: 'high',
    is_read: true,
    hours_ago: 5.5,
    title: 'Price Surge Alert: Soybean (+9.0%)',
    message: 'Modal price for Soybean (Envy) increased from ₹4,850/q to ₹5,287/q (+₹437/q / +9.0%) at Indore Mandi, Indore.'
  },
  {
    crop_type: 'castor',
    variety: 'Pusa Bold',
    mandi_name: 'Deesa APMC',
    district: 'Banaskantha',
    state: 'Gujarat',
    previous_price: 5680,
    new_price: 6180,
    percentage_increase: 8.8,
    amount_increase: 500,
    priority: 'normal',
    is_read: true,
    hours_ago: 7.5,
    title: 'Price Surge Alert: Castor (+8.8%)',
    message: 'Modal price for Castor (Pusa Bold) increased from ₹5,680/q to ₹6,180/q (+₹500/q / +8.8%) at Deesa APMC, Banaskantha.'
  },
  {
    crop_type: 'mustard',
    variety: 'Giriraj',
    mandi_name: 'Bharatpur Mandi',
    district: 'Bharatpur',
    state: 'Rajasthan',
    previous_price: 5380,
    new_price: 5840,
    percentage_increase: 8.6,
    amount_increase: 460,
    priority: 'normal',
    is_read: true,
    hours_ago: 10.0,
    title: 'Price Surge Alert: Mustard (+8.6%)',
    message: 'Modal price for Mustard (Giriraj) increased from ₹5,380/q to ₹5,840/q (+₹460/q / +8.6%) at Bharatpur Mandi, Bharatpur.'
  },
  {
    crop_type: 'soybean',
    variety: 'JS-335',
    mandi_name: 'Kota Mandi',
    district: 'Kota',
    state: 'Rajasthan',
    previous_price: 4650,
    new_price: 5080,
    percentage_increase: 9.2,
    amount_increase: 430,
    priority: 'normal',
    is_read: true,
    hours_ago: 14.0,
    title: 'Price Surge Alert: Soybean (+9.2%)',
    message: 'Modal price for Soybean (JS-335) increased from ₹4,650/q to ₹5,080/q (+₹430/q / +9.2%) at Kota Mandi, Kota.'
  }
];

async function run() {
  console.log('Seeding price surge alerts into Supabase notifications for ALL roles...');
  const { data: allUsers, error: userErr } = await adminClient
    .from('users')
    .select('id, email, full_name, role');

  if (userErr) {
    console.error('Failed to fetch users:', userErr);
    return;
  }

  console.log(`Found ${allUsers.length} total users in platform:`);
  allUsers.forEach(u => console.log(`  - ${u.role}: ${u.full_name || u.email} (${u.id})`));

  let totalInserted = 0;

  for (const user of allUsers) {
    const actionUrl = user.role === 'farmer' ? '/farmer?tab=overview'
      : user.role === 'fpo' ? '/fpo?tab=notifications'
      : user.role === 'processor' ? '/processor?tab=overview'
      : user.role === 'retailer' ? '/retailer?tab=overview'
      : user.role === 'government' ? '/government?tab=overview'
      : '/admin?tab=overview';

    for (const alert of alertsTemplate) {
      const { data: existing } = await adminClient
        .from('notifications')
        .select('id')
        .eq('user_id', user.id)
        .eq('category', 'mandi_price')
        .eq('title', alert.title)
        .maybeSingle();

      if (!existing) {
        const createdAt = new Date(Date.now() - alert.hours_ago * 3600 * 1000).toISOString();
        const { data, error } = await adminClient.from('notifications').insert({
          user_id: user.id,
          category: 'mandi_price',
          priority: alert.priority,
          title: alert.title,
          message: alert.message,
          action_url: actionUrl,
          is_read: alert.is_read,
          created_at: createdAt,
          metadata: {
            crop_type: alert.crop_type,
            variety: alert.variety,
            previous_price: alert.previous_price,
            new_price: alert.new_price,
            percentage_increase: alert.percentage_increase,
            amount_increase: alert.amount_increase,
            mandi_name: alert.mandi_name,
            district: alert.district,
            state: alert.state,
            price_date: createdAt.split('T')[0]
          }
        }).select();

        if (error) {
          console.error(`Error inserting for ${user.full_name} (${user.role}):`, error.message);
        } else if (data) {
          totalInserted++;
        }
      }
    }
  }

  console.log(`\n✅ Successfully seeded ${totalInserted} price alerts across all user accounts.`);

  // Verify FPO (Samyaraj)
  const fpoUser = allUsers.find(u => u.role === 'fpo');
  if (fpoUser) {
    const { data: fpoAlerts, count } = await adminClient
      .from('notifications')
      .select('id, title, is_read, metadata', { count: 'exact' })
      .eq('user_id', fpoUser.id)
      .eq('category', 'mandi_price')
      .order('created_at', { ascending: false });

    console.log(`\nFPO (${fpoUser.full_name}) now has ${count} price alerts:`);
    fpoAlerts?.forEach((a, i) => {
      console.log(`  ${i + 1}. [${a.is_read ? 'READ' : 'NEW'}] ${a.title} - ${a.metadata?.mandi_name} (₹${a.metadata?.previous_price} -> ₹${a.metadata?.new_price})`);
    });
  }
}

run().catch(console.error);
