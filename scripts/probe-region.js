/**
 * Probe all Supabase pooler regions to find the project's exact region
 */
import pg from 'pg';
const { Client } = pg;

const PROJECT_REF = 'aiobuiyuarozsbfzonam';
const password = 'aienabled@123';

const regions = [
  'ap-south-1',       // Mumbai
  'ap-southeast-1',   // Singapore
  'ap-southeast-2',   // Sydney
  'ap-northeast-1',   // Tokyo
  'ap-northeast-2',   // Seoul
  'us-east-1',        // N. Virginia
  'us-east-2',        // Ohio
  'us-west-1',        // N. California
  'us-west-2',        // Oregon
  'eu-central-1',     // Frankfurt
  'eu-west-1',        // Ireland
  'eu-west-2',        // London
  'eu-west-3',        // Paris
  'eu-north-1',       // Stockholm
  'sa-east-1',        // São Paulo
  'ca-central-1',     // Central Canada
  'me-central-1',     // UAE
  'af-south-1',       // Cape Town
];

async function probe() {
  console.log(`🔍 Probing Supabase Pooler regions for project ${PROJECT_REF}...`);
  for (const region of regions) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    const client = new Client({
      host,
      port: 6543,
      user: `postgres.${PROJECT_REF}`,
      password,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 4000,
    });

    try {
      await client.connect();
      console.log(`\n🎯 FOUND ACTIVE REGION: ${region} (${host})!`);
      await client.end();
      return region;
    } catch (err) {
      if (err.message.includes('tenant/user') || err.message.includes('not found')) {
        // Not in this region
        process.stdout.write(`.`);
      } else {
        console.log(`\n⚠️ Region ${region}: ${err.message}`);
        if (!err.message.includes('ENOTFOUND') && !err.message.includes('timeout')) {
          // Might be right region with specific error
          return region;
        }
      }
    }
  }
  console.log('\n❌ No matching pooler found.');
  return null;
}

probe().then(async (matchedRegion) => {
  if (matchedRegion) {
    console.log(`Running deploy on region: ${matchedRegion}`);
  }
});
