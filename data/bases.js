// Home-base definitions. Several US towns are named Ashford; pick yours in the sidebar
// or choose "Custom coordinates". assessmentRatio is the state's default ratio of
// assessed value to market value; nearbyStates drives which regional sources are shown.
window.BASES = [
  {
    id: "ashford-ct",
    label: "Ashford, Connecticut (Windham County)",
    short: "Ashford, CT",
    lat: 41.8734, lng: -72.1215,
    state: "CT",
    assessmentRatio: 0.70,
    nearbyStates: ["CT", "RI", "MA", "NY", "NH"],
    craigslist: ["hartford", "newlondon", "providence", "worcester", "westernmass", "boston", "hudsonvalley"],
    note: "100 miles covers all of Connecticut and Rhode Island, most of Massachusetts, the Hudson Valley in New York and southern New Hampshire."
  },
  {
    id: "ashford-wa",
    label: "Ashford, Washington (Pierce County, Mt. Rainier gateway)",
    short: "Ashford, WA",
    lat: 46.7568, lng: -122.0354,
    state: "WA",
    assessmentRatio: 1.00,
    nearbyStates: ["WA", "OR"],
    craigslist: ["seattle", "olympic", "yakima", "portland"],
    note: "100 miles covers Pierce, Lewis, Thurston, King, Yakima and Kittitas counties plus Clark County near Portland."
  },
  {
    id: "ashford-al",
    label: "Ashford, Alabama (Houston County)",
    short: "Ashford, AL",
    lat: 31.1830, lng: -85.2363,
    state: "AL",
    assessmentRatio: 0.20,
    nearbyStates: ["AL", "GA", "FL"],
    craigslist: ["dothan", "montgomery", "auburn", "tallahassee", "panamacity", "albanyga", "columbusga"],
    note: "Alabama assesses Class II (non-owner-occupied, commercial) land at 20% and Class III (agricultural / forest use) at 10%. Set the parcel ratio to 0.10 for current-use timber or farm land."
  },
  {
    id: "ashford-ny",
    label: "Ashford, New York (Cattaraugus County)",
    short: "Ashford, NY",
    lat: 42.4340, lng: -78.6690,
    state: "NY",
    assessmentRatio: 1.00,
    nearbyStates: ["NY", "PA"],
    craigslist: ["buffalo", "rochester", "chautauqua", "erie"],
    note: "New York equalization rates vary by town. Enter the town's rate as the parcel assessment ratio when it is not 100%."
  },
  {
    id: "ashford-wv",
    label: "Ashford, West Virginia (Boone County)",
    short: "Ashford, WV",
    lat: 38.1926, lng: -81.7090,
    state: "WV",
    assessmentRatio: 0.60,
    nearbyStates: ["WV", "KY", "OH", "VA"],
    craigslist: ["charlestonwv", "huntington"],
    note: "West Virginia assesses at 60% of appraised value. Delinquent land is sold through the State Auditor's land office."
  },
  {
    id: "ashford-kent",
    label: "Ashford, Kent, United Kingdom",
    short: "Ashford, Kent",
    lat: 51.1465, lng: 0.8750,
    state: "UK",
    assessmentRatio: 1.00,
    nearbyStates: ["UK"],
    craigslist: [],
    note: "The UK has no tax-sale system. Opportunities come from auction houses, receivership sales and probate. There is no assessed value; enter a comp-based market value from Land Registry price-paid data."
  },
  {
    id: "custom",
    label: "Custom coordinates…",
    short: "custom base",
    lat: null, lng: null,
    state: "",
    assessmentRatio: 1.00,
    nearbyStates: [],
    craigslist: [],
    note: "Enter latitude and longitude for any location."
  }
];
