// Directory of places to find discounted land. Each entry has the deal types it
// covers and a note on how to use it. Links open the site's main page or a stable
// section; refine to land / 5+ acres once there. Search links that take the base
// location are built in app.js from the templates at the bottom of this file.
window.SOURCES = {
  national: [
    { name: "Bid4Assets", url: "https://www.bid4assets.com", types: ["tax-sale", "foreclosure", "government"], note: "Online county tax-deed and sheriff sales. Filter by state; many Washington and Pennsylvania counties sell here." },
    { name: "Auction.com", url: "https://www.auction.com", types: ["foreclosure", "reo", "auction"], note: "Bank foreclosure and REO auctions. Use the Land property type filter." },
    { name: "Hubzu", url: "https://www.hubzu.com", types: ["reo", "short-sale", "auction"], note: "REO and short-sale auctions; vacant lots appear under Land." },
    { name: "Xome", url: "https://www.xome.com", types: ["reo", "foreclosure", "auction"], note: "Servicer-owned property auctions." },
    { name: "RealtyBid", url: "https://www.realtybid.com", types: ["reo", "auction"], note: "Bank-owned and estate auctions." },
    { name: "LandWatch", url: "https://www.landwatch.com", types: ["mls", "fsbo", "auction"], note: "Largest land marketplace. Sort by price per acre and filter Owner Financing and Auction." },
    { name: "Land.com", url: "https://www.land.com", types: ["mls", "fsbo"], note: "Sister site to LandWatch and Lands of America." },
    { name: "Land And Farm", url: "https://www.landandfarm.com", types: ["mls", "fsbo"], note: "Rural acreage and farms." },
    { name: "LandFlip", url: "https://www.landflip.com", types: ["fsbo", "mls"], note: "Smaller sellers and wholesalers; prices are often negotiable." },
    { name: "LandSearch", url: "https://www.landsearch.com", types: ["mls", "fsbo"], note: "Good acreage and price-per-acre filters." },
    { name: "Landmodo", url: "https://www.landmodo.com", types: ["fsbo"], note: "Owner-financed lots from land investors; verify assessed value carefully." },
    { name: "Zillow", url: "https://www.zillow.com", types: ["mls", "fsbo", "foreclosure"], note: "Set Home Type to Lots/Land and Lot Size to 5+ acres; the Zestimate is unreliable for land, use the assessor card." },
    { name: "Realtor.com", url: "https://www.realtor.com", types: ["mls"], note: "Land filter, price-reduced flag and days-on-market are useful for motivated sellers." },
    { name: "Redfin", url: "https://www.redfin.com", types: ["mls"], note: "Shows price history and lot size; filter to Land." },
    { name: "LoopNet", url: "https://www.loopnet.com", types: ["mls", "auction"], note: "Commercial and larger land tracts, including bank-owned." },
    { name: "Crexi", url: "https://www.crexi.com", types: ["mls", "auction"], note: "Commercial land and online auctions." },
    { name: "USDA Real Estate for Sale", url: "https://resales.usda.gov", types: ["government"], note: "Rural Development and Farm Service Agency inventory property, including farmland." },
    { name: "GSA Real Property Sales", url: "https://realestatesales.gov", types: ["government", "auction"], note: "Surplus federal land and buildings." },
    { name: "U.S. Treasury Auctions", url: "https://www.treasury.gov/auctions", types: ["government", "auction"], note: "Seized and forfeited real property." },
    { name: "IRS Auctions", url: "https://www.irsauctions.gov", types: ["government", "auction"], note: "Property seized for unpaid federal taxes; includes land." },
    { name: "GovDeals", url: "https://www.govdeals.com", types: ["government", "auction"], note: "Municipal surplus; occasionally town-owned lots." },
    { name: "Public Surplus", url: "https://www.publicsurplus.com", types: ["government", "auction"], note: "Government surplus auctions, some real estate." },
    { name: "Fannie Mae HomePath", url: "https://www.homepath.com", types: ["reo"], note: "Mostly homes but lots appear after teardown or fire." },
    { name: "Freddie Mac HomeSteps", url: "https://www.homesteps.com", types: ["reo"], note: "REO inventory." },
    { name: "HUD Home Store", url: "https://www.hudhomestore.gov", types: ["reo", "government"], note: "FHA-foreclosed property; land is rare but does appear." },
    { name: "Regrid parcel map", url: "https://app.regrid.com", types: ["research"], note: "Nationwide parcel boundaries, owner names and land-use codes. Use to find absentee owners of vacant land for direct offers." },
    { name: "PropertyRadar / county GIS", url: "https://www.propertyradar.com", types: ["research"], note: "Owner and lien research; county GIS portals (linked per state below) are free." }
  ],

  byState: {
    CT: {
      title: "Connecticut",
      lead: "Tax sales are run by each of the 169 towns, not by counties. Most towns publish notices on their own site and many use the Pullman & Comley auction calendar. Connecticut has a six-month redemption period after a tax sale. Assessment is 70% of market value; revaluations occur every five years, so check the last revaluation date.",
      items: [
        { name: "CT Tax Sales (Pullman & Comley calendar)", url: "https://www.cttaxsales.com", types: ["tax-sale"], note: "Statewide list of upcoming municipal tax sales with parcel lists and minimum bids. The single best source for Connecticut." },
        { name: "CT Judicial Branch foreclosure sales", url: "https://www.jud.ct.gov/foreclosure/", types: ["foreclosure"], note: "Court-ordered foreclosure auctions listed by town with committee sale dates." },
        { name: "CT Judicial case look-up", url: "https://www.jud.ct.gov/jud2.htm", types: ["foreclosure", "research"], note: "Search pending foreclosure and lien cases by town to find pre-foreclosure land." },
        { name: "Vision Government Solutions assessor databases", url: "https://www.vgsi.com", types: ["research"], note: "Online assessor cards for most Connecticut, Rhode Island and Massachusetts towns: land value, building value, acreage and last revaluation." },
        { name: "CT ECO parcel viewer (UConn)", url: "https://cteco.uconn.edu", types: ["research"], note: "Statewide parcel layer with owner and acreage; wetlands and flood layers too." },
        { name: "CT Department of Agriculture farmland", url: "https://portal.ct.gov/doag", types: ["government"], note: "Farmland preservation and occasional state land dispositions." },
        { name: "CT DEEP state land and surplus", url: "https://portal.ct.gov/deep", types: ["government"], note: "Watch for surplus property notices." }
      ]
    },
    RI: {
      title: "Rhode Island",
      lead: "Tax sales are held by each city and town, usually once a year, with a one-year redemption period. Assessment is 100% of market value with statistical revaluations every three years.",
      items: [
        { name: "RI League of Cities and Towns", url: "https://www.rileague.org", types: ["tax-sale", "research"], note: "Directory of municipal sites; each tax collector posts its own tax-sale list. Search \"<town> RI tax sale\" for the notice." },
        { name: "RI Judiciary public portal", url: "https://publicportal.courts.ri.gov", types: ["foreclosure", "research"], note: "Search pending foreclosure and receivership cases." },
        { name: "RIGIS parcel data", url: "https://www.rigis.org", types: ["research"], note: "Statewide parcel boundaries and land-use layers." },
        { name: "Vision Government Solutions", url: "https://www.vgsi.com", types: ["research"], note: "Assessor cards for most RI towns." }
      ]
    },
    MA: {
      title: "Massachusetts",
      lead: "Towns take tax title on delinquent parcels and then foreclose through the Land Court; the town treasurer then auctions the land. Watch treasurer pages and Land Court dockets. Assessment is 100% of market value.",
      items: [
        { name: "MassGIS property tax parcels", url: "https://www.mass.gov/info-details/massgis-data-property-tax-parcels", types: ["research"], note: "Statewide standardized parcel data with assessed land and building values, downloadable by town." },
        { name: "Massachusetts Land Court", url: "https://www.mass.gov/orgs/land-court", types: ["tax-sale", "foreclosure"], note: "Tax-lien foreclosure dockets show which parcels are about to be auctioned by towns." },
        { name: "Massachusetts trial court case search", url: "https://www.masscourts.org", types: ["foreclosure", "research"], note: "Search Land Court and Superior Court cases by town." },
        { name: "DCAMM surplus state property", url: "https://www.mass.gov/orgs/division-of-capital-asset-management-and-maintenance", types: ["government"], note: "State surplus real estate dispositions." },
        { name: "Zekos / Paul E. Saperstein / Aaron Posnik auctioneers", url: "https://www.posnik.com", types: ["auction", "foreclosure"], note: "Long-running Massachusetts real-estate auctioneers; their calendars list mortgagee sales of land." }
      ]
    },
    NY: {
      title: "New York",
      lead: "Counties foreclose on delinquent parcels and auction them, usually once a year, often through contracted auctioneers. Equalization rates vary by town; enter the parcel's rate when known.",
      items: [
        { name: "Auctions International", url: "https://www.auctionsinternational.com", types: ["tax-sale", "government"], note: "Runs online tax-foreclosure auctions for many New York counties." },
        { name: "NYS Auctions (Haroff)", url: "https://www.nysauctions.com", types: ["tax-sale"], note: "County tax-foreclosure auctions across upstate New York." },
        { name: "Absolute Auctions & Realty", url: "https://www.absoluteauctionsrealty.com", types: ["tax-sale", "auction"], note: "Runs Dutchess, Ulster and other Hudson Valley county tax auctions." },
        { name: "NYS Office of General Services surplus", url: "https://ogs.ny.gov", types: ["government"], note: "State surplus real property." },
        { name: "NYS GIS parcel program", url: "https://gis.ny.gov", types: ["research"], note: "Statewide parcel data and county assessment rolls." }
      ]
    },
    NH: {
      title: "New Hampshire",
      lead: "Towns take tax deeds after a lien period and sell tax-deeded property by sealed bid or auction. Assessment ratios vary by town and are published yearly.",
      items: [
        { name: "NH GRANIT GIS", url: "https://granit.unh.edu", types: ["research"], note: "Statewide parcel layers." },
        { name: "NH Department of Revenue equalization ratios", url: "https://www.revenue.nh.gov", types: ["research"], note: "Look up the town's assessment ratio." },
        { name: "James R. St. Jean Auctioneers", url: "https://www.jsjauctions.com", types: ["tax-sale", "auction", "foreclosure"], note: "Major NH auctioneer for town tax-deeded property and mortgagee sales." }
      ]
    },
    WA: {
      title: "Washington",
      lead: "County treasurers hold tax-foreclosure sales once a year, typically in late fall, many online through Bid4Assets. Assessment is 100% of market value.",
      items: [
        { name: "Pierce County Assessor-Treasurer", url: "https://www.piercecountywa.gov", types: ["tax-sale", "research"], note: "Foreclosure sale list and parcel search." },
        { name: "Lewis County Treasurer", url: "https://lewiscountywa.gov", types: ["tax-sale"], note: "Annual foreclosure and surplus property sales." },
        { name: "Thurston County Treasurer", url: "https://www.thurstoncountywa.gov", types: ["tax-sale"], note: "Tax foreclosure auction." },
        { name: "WA DNR land transactions", url: "https://www.dnr.wa.gov", types: ["government"], note: "State trust land sales and exchanges." }
      ]
    },
    OR: {
      title: "Oregon",
      lead: "Counties hold periodic sheriff sales of tax-foreclosed land; check each county's tax-foreclosed property page.",
      items: [
        { name: "Clark County (WA) Treasurer", url: "https://clark.wa.gov", types: ["tax-sale"], note: "Adjacent to Portland; annual foreclosure auction." },
        { name: "Oregon Department of State Lands", url: "https://www.oregon.gov/dsl", types: ["government"], note: "State land sales." }
      ]
    },
    AL: {
      title: "Alabama",
      lead: "Counties hold annual tax-lien or tax-sale auctions in spring; parcels unsold at auction go to the State of Alabama and can be bought over the counter from the Department of Revenue, often for the back taxes owed. Redemption period is three years.",
      items: [
        { name: "Alabama Dept. of Revenue delinquent property", url: "https://www.revenue.alabama.gov/property-tax/", types: ["tax-sale", "government"], note: "State-held tax-delinquent land is searchable and purchasable by application." },
        { name: "GovEase", url: "https://www.govease.com", types: ["tax-sale"], note: "Online tax-lien auctions for many Alabama counties." },
        { name: "Houston County Revenue Commissioner", url: "https://www.houstoncounty.org", types: ["tax-sale", "research"], note: "Local tax sale notice and parcel records." },
        { name: "Alabama Forestry Commission", url: "https://forestry.alabama.gov", types: ["research"], note: "Timber-land resources; current-use valuation lowers assessments to 10%." }
      ]
    },
    GA: {
      title: "Georgia",
      lead: "County tax commissioners hold tax sales on the first Tuesday of the month at the courthouse; one-year redemption period.",
      items: [
        { name: "Georgia Department of Revenue", url: "https://dor.georgia.gov", types: ["tax-sale", "research"], note: "Links to county tax commissioners." }
      ]
    },
    FL: {
      title: "Florida",
      lead: "Tax certificates are sold each June; after two years the holder can force a tax-deed sale run by the county clerk, many online via RealAuction or Grant Street.",
      items: [
        { name: "RealTaxDeed / RealAuction", url: "https://www.realauction.com", types: ["tax-sale", "foreclosure"], note: "Online tax-deed and foreclosure auctions for most Florida Panhandle counties." }
      ]
    },
    WV: {
      title: "West Virginia",
      lead: "Delinquent land is certified to the State Auditor and sold at annual auctions or over the counter.",
      items: [
        { name: "WV State Auditor land sales", url: "https://www.wvsao.gov", types: ["tax-sale", "government"], note: "Delinquent and non-entered land sales." }
      ]
    },
    PA: {
      title: "Pennsylvania",
      lead: "County tax claim bureaus hold Upset sales in September and Judicial (free-and-clear) sales later; Judicial sales wipe out liens.",
      items: [
        { name: "Bid4Assets Pennsylvania", url: "https://www.bid4assets.com", types: ["tax-sale"], note: "Many PA counties sell online." }
      ]
    },
    KY: { title: "Kentucky", lead: "Counties sell certificates of delinquency; land itself reaches the market via master commissioner sales.", items: [] },
    OH: { title: "Ohio", lead: "Sheriff sales and county land banks; forfeited land sales through the county auditor.", items: [] },
    VA: { title: "Virginia", lead: "Judicial tax sales run by county treasurers through contracted auctioneers.", items: [] },
    UK: {
      title: "United Kingdom",
      lead: "No tax-sale system. Below-market land comes through auction houses, receivership and probate. Use Land Registry price-paid data for comparables.",
      items: [
        { name: "Clive Emson Auctioneers", url: "https://www.cliveemson.co.uk", types: ["auction"], note: "Kent and south-east land auctions." },
        { name: "Allsop", url: "https://www.allsop.co.uk", types: ["auction", "receivership"], note: "National auctioneer with land and receivership lots." },
        { name: "Savills Auctions", url: "https://auctions.savills.co.uk", types: ["auction"], note: "Land and development plots." },
        { name: "Rightmove land", url: "https://www.rightmove.co.uk", types: ["mls"], note: "Filter property type to Land." },
        { name: "HM Land Registry price paid data", url: "https://landregistry.data.gov.uk", types: ["research"], note: "Comparable sales for market value." }
      ]
    }
  },

  // Pre-built search URL templates. {town}, {state}, {stateName}, {lat}, {lng},
  // {radiusMi}, {minAcres} are substituted. Patterns follow each site's public URL
  // structure at the time of writing; if a site changes, the link still lands on
  // the site so you can refine there.
  searchTemplates: [
    { name: "Zillow lots & land near base", url: "https://www.zillow.com/{townSlug}-{stateLower}/land/", note: "Then set Lot Size ≥ 5 acres and sort by price." },
    { name: "Realtor.com land near base", url: "https://www.realtor.com/realestateandhomes-search/{townCap}_{state}/type-land", note: "Add the Lot Size filter and Price Reduced flag." },
    { name: "LandWatch {stateName}", url: "https://www.landwatch.com/{stateNameSlug}-land-for-sale", note: "Filter to 5+ acres, sort by price per acre, and tick Auction and Owner Financing." },
    { name: "Land.com {stateName}", url: "https://www.land.com/{stateNameSlug}/all-land/", note: "Same inventory as LandWatch with a different search UI." },
    { name: "LandSearch {stateName}", url: "https://www.landsearch.com/properties/{stateNameSlug}", note: "Good price-per-acre and acreage filters." },
    { name: "Auction.com land in {stateName}", url: "https://www.auction.com/residential/{stateLower}/", note: "Filter Property Type to Land." },
    { name: "Bid4Assets {stateName}", url: "https://www.bid4assets.com", note: "Browse Real Estate → filter by state for county tax sales." },
    { name: "Google: tax sale notices near base", url: "https://www.google.com/search?q={q1}", q: "\"tax sale\" OR \"tax deed\" OR \"tax foreclosure\" land acres {state} {townCap} OR {nearbyTowns}", note: "Catches town-by-town notices that never reach aggregators." },
    { name: "Google: short sale land", url: "https://www.google.com/search?q={q1}", q: "\"short sale\" land OR lot OR acres {stateName} \"{minAcres}+ acres\" OR \"acres\"", note: "Short-sale land listings are usually labelled in the MLS remarks." },
    { name: "Google: estate / probate land auctions", url: "https://www.google.com/search?q={q1}", q: "estate auction OR probate land acres {stateName} {townCap} OR {nearbyTowns}", note: "Auctioneer calendars." }
  ],
  craigslistTemplate: "https://{region}.craigslist.org/search/rea?query=land+acres&min_price=1"
};
