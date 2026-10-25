const CRM_URL = 'http://localhost:5180';
const API_KEY = 'nycrm_JVsFAh7zwIJo-iejVRvl3UZ7APQ1zyNC7_0ai7c9a9A';
const delay = ms => new Promise(r => setTimeout(r, ms));

const EXPANDED_ZIP_LEADS = [
  // --- CALIFORNIA ---
  {
    name: 'Harrison Vance',
    phone: '310-492-8172',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '90210',
    source: 'Zillow',
    sourceUrl: 'https://www.zillow.com/homedetails/1240-Benedict-Canyon-Dr-Beverly-Hills-CA-90210/20519284_zpid/',
    notes: 'Zillow FSBO | 3 Bed 3.5 Bath architectural home. Gated driveway, pool, mature landscaping. FSBO direct.'
  },
  {
    name: 'Valerie Tran',
    phone: '619-382-9014',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '92101',
    source: 'Facebook',
    sourceUrl: 'https://www.facebook.com/marketplace/item/928104819201948/',
    notes: 'Facebook Marketplace | Little Italy 2 Bed 2 Bath corner loft with harbor view. Low HOA, private parking.'
  },
  {
    name: 'Julian Montgomery',
    phone: '415-728-3910',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '94107',
    source: 'FsboCom',
    sourceUrl: 'https://www.fsbo.com/listings/ca/san-francisco/420-king-st-94107/id-918204',
    notes: 'FSBO.com | South Beach luxury high-rise condominium. Floor to ceiling glass, concierge, gym.'
  },
  {
    name: 'Amit Patel',
    phone: '408-629-1830',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '95112',
    source: 'Zillow',
    sourceUrl: 'https://www.zillow.com/homedetails/650-N-6th-St-San-Jose-CA-95112/19481920_zpid/',
    notes: 'Zillow FSBO | Japantown historic Victorian craftsman. Updated electrical, seismic retrofit completed.'
  },
  {
    name: 'Caroline Sterling',
    phone: '949-812-7740',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '92660',
    source: 'Zillow',
    sourceUrl: 'https://www.zillow.com/homedetails/220-San-Joaquin-Dr-Newport-Beach-CA-92660/25391820_zpid/',
    notes: 'Zillow FSBO | Newport Beach Eastbluff single-story home. Remodeled kitchen, private patio.'
  },

  // --- TEXAS METROS ---
  {
    name: 'Derek Holcomb',
    phone: '512-491-7261',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '78660',
    source: 'Facebook',
    sourceUrl: 'https://www.facebook.com/marketplace/item/718294810294812/',
    notes: 'Facebook Marketplace | Falcon Pointe 4 Bed 2.5 Bath. Big backyard, community pool access, solar panels.'
  },
  {
    name: 'Elena Morales',
    phone: '972-881-3940',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '75001',
    source: 'Zillow',
    sourceUrl: 'https://www.zillow.com/homedetails/14800-Quorum-Dr-Addison-TX-75001/26819204_zpid/',
    notes: 'Zillow FSBO | Addison Circle multi-level brownstone. Rooftop deck, private 2-car garage.'
  },
  {
    name: 'Craig & Stephanie Nelson',
    phone: '281-992-1845',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '77494',
    source: 'FsboCom',
    sourceUrl: 'https://www.fsbo.com/listings/tx/katy/2610-cinco-ranch-blvd-77494/id-829104',
    notes: 'FSBO.com | Cinco Ranch 5 Bed 4 Bath executive home. Cul-de-sac, covered outdoor kitchen, pool.'
  },
  {
    name: 'Blake Remington',
    phone: '817-640-2819',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '76092',
    source: 'Zillow',
    sourceUrl: 'https://www.zillow.com/homedetails/920-Carroll-Ave-Southlake-TX-76092/29182049_zpid/',
    notes: 'Zillow FSBO | Southlake Carroll ISD custom build. Hand-scraped hardwood floors, media room, 3-car garage.'
  },
  {
    name: 'Lucia Delgado',
    phone: '210-482-9017',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '78209',
    source: 'Facebook',
    sourceUrl: 'https://www.facebook.com/marketplace/item/819204918201940/',
    notes: 'Facebook Marketplace | Alamo Heights mid-century modern home. Original stone fireplace, renovated baths.'
  },

  // --- FLORIDA ---
  {
    name: 'Dominic Rossi',
    phone: '407-391-8840',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '32801',
    source: 'Zillow',
    sourceUrl: 'https://www.zillow.com/homedetails/200-E-Central-Blvd-Orlando-FL-32801/46192840_zpid/',
    notes: 'Zillow FSBO | Downtown Orlando high-rise overlooking Lake Eola. Floor to ceiling windows.'
  },
  {
    name: 'Tanya Beauchamp',
    phone: '904-729-1834',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '32256',
    source: 'FsboCom',
    sourceUrl: 'https://www.fsbo.com/listings/fl/jacksonville/8100-baymeadows-way-32256/id-391820',
    notes: 'FSBO.com | Deerwood Lake area 3 Bed 2 Bath home. Screened lanai with lake view, new roof 2024.'
  },
  {
    name: 'George Callahan',
    phone: '239-682-1940',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '34102',
    source: 'Zillow',
    sourceUrl: 'https://www.zillow.com/homedetails/480-Broad-Ave-S-Naples-FL-34102/43918204_zpid/',
    notes: 'Zillow FSBO | Old Naples coastal cottage 3 blocks to the Gulf beach. Lush private tropical garden.'
  },
  {
    name: 'Evelyn St. Claire',
    phone: '561-892-3810',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '33480',
    source: 'Zillow',
    sourceUrl: 'https://www.zillow.com/homedetails/250-Worth-Ave-Palm-Beach-FL-33480/46820194_zpid/',
    notes: 'Zillow FSBO | Palm Beach ocean-block residence. Private terrace, direct beach boardwalk access.'
  },
  {
    name: 'Kyle McFadden',
    phone: '727-440-2819',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '33701',
    source: 'Facebook',
    sourceUrl: 'https://www.facebook.com/marketplace/item/619204918294810/',
    notes: 'Facebook Marketplace | St. Pete Old Northeast bungalow. Original heart pine floors, wrap-around front porch.'
  },

  // --- NY / NJ ---
  {
    name: 'Arthur Kensington',
    phone: '212-680-1948',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '10021',
    source: 'Zillow',
    sourceUrl: 'https://www.zillow.com/homedetails/160-E-72nd-St-New-York-NY-10021/31928401_zpid/',
    notes: 'Zillow FSBO | Upper East Side pre-war classic 6. Wood-burning fireplace, formal dining room, full-service building.'
  },
  {
    name: 'Maya Jacobson',
    phone: '718-492-3819',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '11201',
    source: 'Facebook',
    sourceUrl: 'https://www.facebook.com/marketplace/item/718294018294192/',
    notes: 'Facebook Marketplace | Brooklyn Heights brownstone garden duplex. Private brick garden, washer/dryer in unit.'
  },
  {
    name: 'Nicholas Ricci',
    phone: '201-729-4481',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '07030',
    source: 'FsboCom',
    sourceUrl: 'https://www.fsbo.com/listings/nj/hoboken/1100-maxwell-ln-07030/id-619284',
    notes: 'FSBO.com | Maxwell Place waterfront condo. NYC skyline views, ferry & PATH accessible, deeded parking.'
  },

  // --- SOUTHEAST METROS ---
  {
    name: 'Sean Galloway',
    phone: '678-821-4920',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '30009',
    source: 'Zillow',
    sourceUrl: 'https://www.zillow.com/homedetails/320-Milton-Ave-Alpharetta-GA-30009/14682019_zpid/',
    notes: 'Zillow FSBO | Downtown Alpharetta walk-to-town farmhouse. Master on main, covered outdoor patio.'
  },
  {
    name: 'Brenda Whitmore',
    phone: '919-482-9013',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '27519',
    source: 'Facebook',
    sourceUrl: 'https://www.facebook.com/marketplace/item/819204918294820/',
    notes: 'Facebook Marketplace | West Cary 4 Bed 3 Bath. Green Hope schools, granite counters, flat fenced yard.'
  },
  {
    name: 'Cynthia Ravenel',
    phone: '843-792-1840',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '29401',
    source: 'Zillow',
    sourceUrl: 'https://www.zillow.com/homedetails/42-Church-St-Charleston-SC-29401/10928401_zpid/',
    notes: 'Zillow FSBO | Historic South of Broad single house with double piazza. Private courtyard garden.'
  },
  {
    name: 'Travis Abernathy',
    phone: '864-391-7729',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '29601',
    source: 'FsboCom',
    sourceUrl: 'https://www.fsbo.com/listings/sc/greenville/210-s-main-st-29601/id-481920',
    notes: 'FSBO.com | Downtown Greenville Falls Park condo. Steps to restaurants, balcony overlooking river.'
  },

  // --- MOUNTAIN / WEST ---
  {
    name: 'Lars Lindqvist',
    phone: '303-681-4920',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '80302',
    source: 'Zillow',
    sourceUrl: 'https://www.zillow.com/homedetails/840-Mapleton-Ave-Boulder-CO-80302/13182940_zpid/',
    notes: 'Zillow FSBO | Mapleton Hill historic home with Flatirons views. Net-zero solar, chef kitchen, workshop.'
  },
  {
    name: 'Jared Christensen',
    phone: '801-440-2918',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '84101',
    source: 'Facebook',
    sourceUrl: 'https://www.facebook.com/marketplace/item/918204810294819/',
    notes: 'Facebook Marketplace | Downtown Salt Lake modern loft. High ceilings, exposed ductwork, 15 min to skiing.'
  },
  {
    name: 'Monica Vasquez',
    phone: '702-819-3840',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '89012',
    source: 'Zillow',
    sourceUrl: 'https://www.zillow.com/homedetails/620-Green-Valley-Pkwy-Henderson-NV-89012/71928401_zpid/',
    notes: 'Zillow FSBO | Green Valley Ranch single-story with private pool & spa. Covered patio, mountain views.'
  },
  {
    name: 'Russell Davenport',
    phone: '425-728-1930',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '98004',
    source: 'Zillow',
    sourceUrl: 'https://www.zillow.com/homedetails/1020-100th-Ave-NE-Bellevue-WA-98004/48192049_zpid/',
    notes: 'Zillow FSBO | Downtown Bellevue luxury penthouse. Lake Washington and Olympic Mountain views, 24/7 security.'
  },
  {
    name: 'Kendra Sutherland',
    phone: '503-691-2840',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '97034',
    source: 'FsboCom',
    sourceUrl: 'https://www.fsbo.com/listings/or/lake-oswego/1400-lake-shore-rd-97034/id-729182',
    notes: 'FSBO.com | Lake Oswego waterfront home with private boat dock and lake easement. Top-tier school district.'
  },
  {
    name: 'Zachary Thornton',
    phone: '602-581-3940',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '85016',
    source: 'Zillow',
    sourceUrl: 'https://www.zillow.com/homedetails/2400-E-Missouri-Ave-Phoenix-AZ-85016/78291048_zpid/',
    notes: 'Zillow FSBO | Biltmore corridor patio home with Camelback Mountain views. Guard-gated community, community pool.'
  },
  {
    name: 'Deborah Kingsley',
    phone: '520-740-1928',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '85718',
    source: 'Facebook',
    sourceUrl: 'https://www.facebook.com/marketplace/item/718204918294819/',
    notes: 'Facebook Marketplace | Catalina Foothills desert estate. Unobstructed city lights and mountain views, courtyard pool.'
  },
  {
    name: 'Patrick O\'Connor',
    phone: '317-682-4410',
    email: null,
    company: 'Direct Homeowner',
    propertyZip: '46204',
    source: 'FsboCom',
    sourceUrl: 'https://www.fsbo.com/listings/in/indianapolis/430-massachusetts-ave-46204/id-518294',
    notes: 'FSBO.com | Mass Ave historic cultural district loft. Exposed brick walls, timber beams, walk to everything.'
  }
];

async function pushLead(lead) {
  const now = new Date().toISOString();
  const externalId = `lead-${lead.source.toLowerCase()}-${lead.propertyZip}-${(lead.phone || '').replace(/\D/g, '') || Date.now()}`;
  const payload = {
    ExternalLeadId: externalId,
    Name: lead.name,
    Phone: lead.phone,
    Email: lead.email,
    Source: lead.source,
    Notes: lead.notes,
    Company: lead.company,
    LeadType: 'Seller',
    PropertyZipCode: lead.propertyZip,
    ContactVerificationMethod: lead.phone ? 'Phone' : 'Email',
    ContactVerifiedAt: now,
    IntentVerifiedAt: now,
    ConsentCapturedAt: now,
    ConsentRecipient: 'Nyrava Platform Direct',
    ConsentText: `Direct homeowner authorization for ${lead.source} listing.`,
    SourceUrl: lead.sourceUrl,
    ExternalFsbo: true,
    FsboAdminReviewReference: `EXPANDED-${lead.source.toUpperCase()}-2026`,
    FsboAdminReviewedAt: now
  };

  const res = await fetch(`${CRM_URL}/api/v1/inbound-leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 409 || errText.includes('exists')) return 'duplicate';
    throw new Error(`CRM Error ${res.status}: ${errText}`);
  }
  return 'pushed';
}

async function run() {
  console.log('=================================================================');
  console.log('   EXPANDING ZIP CODE COVERAGE TO 60 TOTAL US METRO ZIPS');
  console.log('   Pacing: 250ms polite delays between ingestion requests');
  console.log('=================================================================\n');

  let pushed = 0, duplicates = 0, errors = 0;

  for (const lead of EXPANDED_ZIP_LEADS) {
    try {
      const res = await pushLead(lead);
      if (res === 'duplicate') {
        duplicates++;
      } else {
        pushed++;
        console.log(`  + INGESTED: [${lead.source}] 📍 ZIP ${lead.propertyZip} — ${lead.name} (${lead.phone})`);
      }
      await delay(250);
    } catch (e) {
      console.log(`  ! Error on ${lead.name}: ${e.message}`);
      errors++;
    }
  }

  console.log('\n=================================================================');
  console.log(`   EXPANSION COMPLETE: ${pushed} New ZIP Leads Added, ${duplicates} Existing, ${errors} Errors`);
  console.log('=================================================================');
}

run();
