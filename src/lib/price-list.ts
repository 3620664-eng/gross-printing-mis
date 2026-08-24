import type { CatalogPrice, EstimateFormData, ImpositionResult, PaperStock } from "./types";

type PriceListEstimate = Pick<CatalogPrice, "notes"> & {
  paper: number;
  printing: number;
  finishing: number;
  cutting: number;
};

type TierRate = {
  min: number;
  max?: number;
  rate: number;
};

type FixedRow = {
  quantity: number;
  [key: string]: number;
};

const PRICE_LIST_MINIMUM = 20;

const businessCardRows = {
  color: [
    { quantity: 100, one: 50, two: 64 },
    { quantity: 250, one: 64, two: 93 },
    { quantity: 500, one: 100, two: 137 },
    { quantity: 1000, one: 121, two: 178 },
    { quantity: 1500, one: 150, two: 235 },
    { quantity: 2000, one: 178, two: 284 },
    { quantity: 2500, one: 206, two: 299 },
    { quantity: 5000, one: 303, two: 449 },
    { quantity: 10000, one: 498, two: 629 },
    { quantity: 20000, one: 785, two: 875 }
  ],
  black: [
    { quantity: 100, one: 40, two: 58 },
    { quantity: 250, one: 50, two: 72 },
    { quantity: 500, one: 79, two: 108 },
    { quantity: 1000, one: 85, two: 121 },
    { quantity: 1500, one: 103, two: 140 },
    { quantity: 2000, one: 121, two: 158 },
    { quantity: 2500, one: 139, two: 175 },
    { quantity: 5000, one: 198, two: 243 },
    { quantity: 10000, one: 334, two: 379 },
    { quantity: 20000, one: 549, two: 621 }
  ]
} satisfies Record<string, FixedRow[]>;

const blackCopyRates: Record<string, TierRate[]> = {
  "8.5x11": [
    { min: 1, max: 49, rate: 0.27 },
    { min: 50, max: 99, rate: 0.21 },
    { min: 100, max: 199, rate: 0.16 },
    { min: 200, max: 299, rate: 0.14 },
    { min: 300, max: 399, rate: 0.12 },
    { min: 400, max: 499, rate: 0.11 },
    { min: 500, max: 999, rate: 0.1 },
    { min: 1000, max: 1999, rate: 0.09 },
    { min: 2000, max: 2999, rate: 0.08 },
    { min: 3000, max: 3999, rate: 0.07 },
    { min: 4000, max: 4999, rate: 0.06 },
    { min: 5000, max: 9999, rate: 0.06 },
    { min: 10000, max: 19999, rate: 0.05 },
    { min: 20000, max: 29999, rate: 0.045 },
    { min: 30000, max: 39999, rate: 0.04 },
    { min: 40000, max: 49999, rate: 0.035 },
    { min: 50000, rate: 0.033 }
  ],
  "8.5x14": [
    { min: 1, max: 49, rate: 0.36 },
    { min: 50, max: 99, rate: 0.27 },
    { min: 100, max: 199, rate: 0.22 },
    { min: 200, max: 299, rate: 0.21 },
    { min: 300, max: 499, rate: 0.17 },
    { min: 500, max: 999, rate: 0.13 },
    { min: 1000, max: 1999, rate: 0.11 },
    { min: 2000, max: 2999, rate: 0.09 },
    { min: 3000, max: 4999, rate: 0.085 },
    { min: 5000, max: 9999, rate: 0.075 },
    { min: 10000, max: 19999, rate: 0.075 },
    { min: 20000, max: 29999, rate: 0.068 },
    { min: 30000, max: 39999, rate: 0.06 },
    { min: 40000, max: 49999, rate: 0.053 },
    { min: 50000, rate: 0.049 }
  ],
  "11x17": [
    { min: 1, max: 199, rate: 0.42 },
    { min: 200, max: 299, rate: 0.27 },
    { min: 300, max: 499, rate: 0.23 },
    { min: 500, max: 999, rate: 0.185 },
    { min: 1000, max: 1999, rate: 0.165 },
    { min: 2000, max: 2999, rate: 0.13 },
    { min: 3000, max: 3999, rate: 0.11 },
    { min: 4000, max: 4999, rate: 0.11 },
    { min: 5000, max: 9999, rate: 0.095 },
    { min: 10000, max: 19999, rate: 0.095 },
    { min: 20000, max: 29999, rate: 0.086 },
    { min: 30000, max: 39999, rate: 0.076 },
    { min: 40000, max: 49999, rate: 0.067 },
    { min: 50000, rate: 0.062 }
  ],
  "12x18": [
    { min: 1, max: 199, rate: 0.43 },
    { min: 200, max: 299, rate: 0.28 },
    { min: 300, max: 499, rate: 0.24 },
    { min: 500, max: 999, rate: 0.195 },
    { min: 1000, max: 1999, rate: 0.175 },
    { min: 2000, max: 2999, rate: 0.14 },
    { min: 3000, max: 4999, rate: 0.12 },
    { min: 5000, max: 9999, rate: 0.105 },
    { min: 10000, max: 19999, rate: 0.105 },
    { min: 20000, max: 29999, rate: 0.096 },
    { min: 30000, max: 39999, rate: 0.086 },
    { min: 40000, max: 49999, rate: 0.077 },
    { min: 50000, rate: 0.072 }
  ],
  "13x19": [
    { min: 1, max: 199, rate: 0.44 },
    { min: 200, max: 299, rate: 0.29 },
    { min: 300, max: 499, rate: 0.25 },
    { min: 500, max: 999, rate: 0.205 },
    { min: 1000, max: 1999, rate: 0.185 },
    { min: 2000, max: 2999, rate: 0.15 },
    { min: 3000, max: 4999, rate: 0.13 },
    { min: 5000, max: 9999, rate: 0.115 },
    { min: 10000, max: 19999, rate: 0.115 },
    { min: 20000, max: 29999, rate: 0.106 },
    { min: 30000, max: 39999, rate: 0.096 },
    { min: 40000, max: 49999, rate: 0.087 },
    { min: 50000, rate: 0.082 }
  ]
};

const colorCopyRates: Record<string, TierRate[]> = {
  "8.5x11": [
    { min: 1, max: 19, rate: 1.22 },
    { min: 20, max: 99, rate: 0.59 },
    { min: 100, max: 249, rate: 0.52 },
    { min: 250, max: 499, rate: 0.45 },
    { min: 500, max: 999, rate: 0.38 },
    { min: 1000, max: 1499, rate: 0.29 },
    { min: 1500, max: 1999, rate: 0.21 },
    { min: 2000, max: 2999, rate: 0.2 },
    { min: 3000, max: 3999, rate: 0.19 },
    { min: 4000, max: 4999, rate: 0.18 },
    { min: 5000, max: 9999, rate: 0.17 },
    { min: 10000, rate: 0.16 }
  ],
  wide: [
    { min: 1, max: 19, rate: 1.85 },
    { min: 20, max: 99, rate: 1.05 },
    { min: 100, max: 249, rate: 0.95 },
    { min: 250, max: 499, rate: 0.75 },
    { min: 500, max: 999, rate: 0.59 },
    { min: 1000, max: 1499, rate: 0.42 },
    { min: 1500, max: 1999, rate: 0.39 },
    { min: 2000, max: 2999, rate: 0.37 },
    { min: 3000, max: 3999, rate: 0.35 },
    { min: 4000, max: 4999, rate: 0.33 },
    { min: 5000, max: 9999, rate: 0.31 },
    { min: 10000, rate: 0.29 }
  ]
};

const invitationRows = [
  { key: "a8", label: "A-8 invitation", width: 10.5, height: 7.5, base500: 498, base1000: 652, add100: 41 },
  { key: "a9-thin", label: "A-9 thin invitation", width: 11, height: 8.5, base500: 556, base1000: 806, add100: 61 },
  { key: "a9-thick", label: "A-9 thick invitation", width: 11, height: 8.5, base500: 578, base1000: 849, add100: 64 },
  { key: "single-panel", label: "Single panel invitation", width: 5.5, height: 8.5, base500: 521, base1000: 734, add100: 51 },
  { key: "3-fold", label: "3 fold invitation", width: 13, height: 7.5, base500: 345, base1000: 498, add100: 29 },
  { key: "large-postcard", label: "Large postcard", width: 5.5, height: 8.5, base500: 314, base1000: 356, add100: 19 },
  { key: "small-postcard", label: "Small postcard", width: 4.25, height: 6, base500: 291, base1000: 330, add100: 17 },
  { key: "a10-white", label: "A-10 invitation white", width: 11.5, height: 9, base500: 644, base1000: 965, add100: 78 },
  { key: "a10-antique", label: "A-10 invitation antique white", width: 11.5, height: 9, base500: 697, base1000: 1069, add100: 90 }
];

const envelopeBlackRows: FixedRow[] = [
  { quantity: 100, standard: 43, window10: 43, booklet6x9: 51, open6x9: 56, remittance: 0, booklet9x12: 60, catalog9x12: 67, booklet10x13: 69, catalog10x13: 69, a8: 56, a9: 56 },
  { quantity: 250, standard: 68, window10: 72, booklet6x9: 75, open6x9: 81, remittance: 0, booklet9x12: 95, catalog9x12: 106, booklet10x13: 110, catalog10x13: 110, a8: 81, a9: 81 },
  { quantity: 500, standard: 93, window10: 100, booklet6x9: 107, open6x9: 112, remittance: 165, booklet9x12: 148, catalog9x12: 165, booklet10x13: 175, catalog10x13: 175, a8: 112, a9: 112 },
  { quantity: 1000, standard: 144, window10: 160, booklet6x9: 179, open6x9: 189, remittance: 265, booklet9x12: 266, catalog9x12: 296, booklet10x13: 306, catalog10x13: 306, a8: 189, a9: 189 },
  { quantity: 1500, standard: 171, window10: 195, booklet6x9: 229, open6x9: 243, remittance: 0, booklet9x12: 356, catalog9x12: 396, booklet10x13: 410, catalog10x13: 410, a8: 243, a9: 243 },
  { quantity: 2000, standard: 199, window10: 231, booklet6x9: 276, open6x9: 295, remittance: 0, booklet9x12: 444, catalog9x12: 493, booklet10x13: 510, catalog10x13: 510, a8: 295, a9: 295 },
  { quantity: 2500, standard: 226, window10: 286, booklet6x9: 326, open6x9: 350, remittance: 0, booklet9x12: 533, catalog9x12: 592, booklet10x13: 613, catalog10x13: 613, a8: 350, a9: 350 },
  { quantity: 3000, standard: 254, window10: 327, booklet6x9: 376, open6x9: 404, remittance: 0, booklet9x12: 623, catalog9x12: 692, booklet10x13: 717, catalog10x13: 717, a8: 404, a9: 404 },
  { quantity: 3500, standard: 282, window10: 339, booklet6x9: 425, open6x9: 456, remittance: 0, booklet9x12: 712, catalog9x12: 791, booklet10x13: 818, catalog10x13: 818, a8: 456, a9: 456 },
  { quantity: 4000, standard: 311, window10: 375, booklet6x9: 434, open6x9: 473, remittance: 0, booklet9x12: 803, catalog9x12: 892, booklet10x13: 923, catalog10x13: 923, a8: 473, a9: 473 },
  { quantity: 4500, standard: 337, window10: 410, booklet6x9: 525, open6x9: 567, remittance: 0, booklet9x12: 891, catalog9x12: 990, booklet10x13: 1025, catalog10x13: 1025, a8: 567, a9: 567 },
  { quantity: 5000, standard: 366, window10: 445, booklet6x9: 573, open6x9: 622, remittance: 0, booklet9x12: 981, catalog9x12: 1089, booklet10x13: 1128, catalog10x13: 1128, a8: 622, a9: 622 },
  { quantity: 5500, standard: 394, window10: 482, booklet6x9: 623, open6x9: 676, remittance: 0, booklet9x12: 1070, catalog9x12: 1187, booklet10x13: 1230, catalog10x13: 1230, a8: 676, a9: 676 },
  { quantity: 6000, standard: 422, window10: 517, booklet6x9: 673, open6x9: 730, remittance: 0, booklet9x12: 1159, catalog9x12: 1287, booklet10x13: 1322, catalog10x13: 1322, a8: 730, a9: 730 },
  { quantity: 6500, standard: 434, window10: 537, booklet6x9: 562, open6x9: 784, remittance: 0, booklet9x12: 1249, catalog9x12: 1387, booklet10x13: 1436, catalog10x13: 1436, a8: 784, a9: 784 },
  { quantity: 7000, standard: 477, window10: 589, booklet6x9: 771, open6x9: 838, remittance: 0, booklet9x12: 1338, catalog9x12: 1486, booklet10x13: 1538, catalog10x13: 1538, a8: 838, a9: 838 },
  { quantity: 7500, standard: 505, window10: 626, booklet6x9: 821, open6x9: 892, remittance: 0, booklet9x12: 1427, catalog9x12: 1584, booklet10x13: 1641, catalog10x13: 1641, a8: 892, a9: 892 },
  { quantity: 8000, standard: 534, window10: 662, booklet6x9: 870, open6x9: 947, remittance: 0, booklet9x12: 1516, catalog9x12: 1683, booklet10x13: 1743, catalog10x13: 1743, a8: 947, a9: 947 },
  { quantity: 8500, standard: 562, window10: 697, booklet6x9: 920, open6x9: 1002, remittance: 0, booklet9x12: 1605, catalog9x12: 1782, booklet10x13: 1845, catalog10x13: 1845, a8: 1002, a9: 1002 },
  { quantity: 9000, standard: 589, window10: 733, booklet6x9: 970, open6x9: 1056, remittance: 0, booklet9x12: 1696, catalog9x12: 1883, booklet10x13: 1950, catalog10x13: 1950, a8: 1056, a9: 1056 },
  { quantity: 9500, standard: 617, window10: 769, booklet6x9: 1019, open6x9: 1110, remittance: 0, booklet9x12: 1785, catalog9x12: 1982, booklet10x13: 2052, catalog10x13: 2052, a8: 1110, a9: 1110 },
  { quantity: 10000, standard: 647, window10: 806, booklet6x9: 1070, open6x9: 1166, remittance: 0, booklet9x12: 1876, catalog9x12: 2083, booklet10x13: 2150, catalog10x13: 2150, a8: 1166, a9: 1166 }
];

const envelopeColorRows: FixedRow[] = [
  { quantity: 100, standard: 95, window10: 95, booklet6x9: 104, open6x9: 110, booklet9x12: 112, catalog9x12: 115, booklet10x13: 118, catalog10x13: 119, a8: 110, a9: 112 },
  { quantity: 250, standard: 192, window10: 198, booklet6x9: 200, open6x9: 205, booklet9x12: 221, catalog9x12: 225, booklet10x13: 235, catalog10x13: 237, a8: 205, a9: 221 },
  { quantity: 500, standard: 260, window10: 264, booklet6x9: 275, open6x9: 281, booklet9x12: 315, catalog9x12: 322, booklet10x13: 342, catalog10x13: 346, a8: 281, a9: 315 },
  { quantity: 1000, standard: 400, window10: 415, booklet6x9: 432, open6x9: 442, booklet9x12: 511, catalog9x12: 522, booklet10x13: 565, catalog10x13: 573, a8: 442, a9: 511 },
  { quantity: 1500, standard: 458, window10: 483, booklet6x9: 506, open6x9: 521, booklet9x12: 626, catalog9x12: 639, booklet10x13: 707, catalog10x13: 719, a8: 521, a9: 626 },
  { quantity: 2000, standard: 567, window10: 599, booklet6x9: 632, open6x9: 649, booklet9x12: 791, catalog9x12: 807, booklet10x13: 899, catalog10x13: 915, a8: 649, a9: 791 },
  { quantity: 2500, standard: 709, window10: 749, booklet6x9: 789, open6x9: 814, booklet9x12: 988, catalog9x12: 1008, booklet10x13: 1123, catalog10x13: 1143, a8: 814, a9: 988 },
  { quantity: 3000, standard: 834, window10: 881, booklet6x9: 930, open6x9: 958, booklet9x12: 1169, catalog9x12: 1193, booklet10x13: 1331, catalog10x13: 1355, a8: 958, a9: 1169 }
];

const labelRates: Record<string, { black: TierRate[]; color: TierRate[] }> = {
  "8.5x11": {
    black: [{ min: 1, rate: 0.72 }],
    color: [
      { min: 1, max: 99, rate: 1.42 },
      { min: 100, max: 199, rate: 1.3 },
      { min: 200, max: 299, rate: 1.13 },
      { min: 300, rate: 0.99 }
    ]
  },
  "11x17": {
    black: [{ min: 1, rate: 1.11 }],
    color: [
      { min: 1, max: 19, rate: 2.13 },
      { min: 20, max: 49, rate: 1.98 },
      { min: 50, max: 99, rate: 1.79 },
      { min: 100, max: 199, rate: 1.42 },
      { min: 200, max: 299, rate: 1.3 },
      { min: 300, max: 399, rate: 1.13 },
      { min: 400, rate: 0.99 }
    ]
  },
  "12x18": {
    black: [{ min: 1, rate: 1.42 }],
    color: [
      { min: 1, max: 19, rate: 2.46 },
      { min: 20, max: 49, rate: 2.34 },
      { min: 50, max: 99, rate: 2.13 },
      { min: 100, max: 199, rate: 1.77 },
      { min: 200, max: 299, rate: 1.64 },
      { min: 300, max: 399, rate: 1.33 },
      { min: 400, rate: 1.18 }
    ]
  }
};

const simchaBagRows: FixedRow[] = [
  { quantity: 50, paperBlack: 40.5, paperColor: 59.5, plasticBlack: 80.5, plasticColor: 99.5 },
  { quantity: 100, paperBlack: 56, paperColor: 92, plasticBlack: 136, plasticColor: 172 },
  { quantity: 150, paperBlack: 74, paperColor: 128, plasticBlack: 194, plasticColor: 248 },
  { quantity: 200, paperBlack: 90, paperColor: 164, plasticBlack: 250, plasticColor: 324 },
  { quantity: 250, paperBlack: 107.5, paperColor: 200, plasticBlack: 307.5, plasticColor: 400 },
  { quantity: 300, paperBlack: 125, paperColor: 236, plasticBlack: 365, plasticColor: 476 },
  { quantity: 350, paperBlack: 142.5, paperColor: 272, plasticBlack: 422.5, plasticColor: 552 },
  { quantity: 400, paperBlack: 160, paperColor: 308, plasticBlack: 480, plasticColor: 628 },
  { quantity: 450, paperBlack: 177.5, paperColor: 344, plasticBlack: 537.5, plasticColor: 704 },
  { quantity: 500, paperBlack: 195, paperColor: 380, plasticBlack: 595, plasticColor: 780 }
];

const laminatingRates = {
  "3mil": {
    "8.5x11": [4, 3.5, 3, 2.5, 2],
    "8.5x14": [4.75, 4, 3.25, 2.9, 2],
    "11x17": [5.25, 4.25, 3.5, 3.3, 2.5],
    "12x18": [5.25, 4.25, 3.5, 3.3, 2.5]
  },
  "5mil": {
    "8.5x11": [4.5, 3.75, 3.25, 2.75, 2.5],
    "8.5x14": [5.5, 4.5, 4.25, 3.25, 3],
    "11x17": [6.25, 5.25, 4.5, 3.8, 3.5],
    "12x18": [6.25, 5.25, 4.5, 3.8, 3.5]
  }
} satisfies Record<string, Record<string, number[]>>;

const laminatingBreaks = [1, 11, 51, 101, 501];

const priceBookCatalogAdditions: CatalogPrice[] = [
  { id: "price-list-logo-start", category: "Graphics", name: "Logo design", unit: "starting at", price: 400, notes: "Page 4" },
  { id: "price-list-fold-half", category: "Folding", name: "Half fold", unit: "option", price: 0, notes: "Folding option from page 5" },
  { id: "price-list-fold-tri", category: "Folding", name: "Tri fold", unit: "option", price: 0, notes: "Folding option from page 5" },
  { id: "price-list-fold-z", category: "Folding", name: "Z fold", unit: "option", price: 0, notes: "Folding option from page 5" },
  { id: "price-list-fold-parallel", category: "Folding", name: "Parallel fold", unit: "option", price: 0, notes: "Folding option from page 5" },
  { id: "price-list-fold-gate", category: "Folding", name: "Gate fold", unit: "option", price: 0, notes: "Folding option from page 5" },
  { id: "price-list-tea-card-bw-1", category: "Tea Party Cards", name: "400 cards black and white 1 side", unit: "400", price: 41.75, notes: "Add 100 is $8.50" },
  { id: "price-list-tea-card-bw-2", category: "Tea Party Cards", name: "400 cards black and white 2 sides", unit: "400", price: 55, notes: "Add 100 is $8.50" },
  { id: "price-list-tea-card-color-1", category: "Tea Party Cards", name: "400 cards color 1 side", unit: "400", price: 62, notes: "Add 100 is $11.80" },
  { id: "price-list-tea-card-color-2", category: "Tea Party Cards", name: "400 cards color 2 sides", unit: "400", price: 103.5, notes: "Add 100 is $15.50" },
  { id: "price-list-stock-matte-card-8511", category: "Paper Add-ons", name: "Matte card stock add-on 8.5x11", unit: "sheet", price: 0.09, notes: "Page 6" },
  { id: "price-list-stock-gloss-card-12pt-8511", category: "Paper Add-ons", name: "Glossy card stock up to 12pt 8.5x11", unit: "sheet", price: 0.18, notes: "Page 6" },
  { id: "price-list-stock-gloss-card-heavy-8511", category: "Paper Add-ons", name: "Glossy card stock 14pt/16pt 8.5x11", unit: "sheet", price: 0.2, notes: "Page 6" },
  { id: "price-list-stock-gloss-paper-8511", category: "Paper Add-ons", name: "Glossy paper add-on 8.5x11", unit: "sheet", price: 0.03, notes: "Page 8" },
  { id: "price-list-stock-linen-paper-8511", category: "Paper Add-ons", name: "Linen/parchment paper 8.5x11", unit: "sheet", price: 0.1, notes: "Page 8" },
  { id: "price-list-stock-linen-card-8511", category: "Paper Add-ons", name: "Linen/parchment card 8.5x11", unit: "sheet", price: 0.2, notes: "Page 8" },
  { id: "price-list-label-8511-black", category: "Labels", name: "8.5x11 labels black ink", unit: "sheet", price: 0.72, notes: "White labels black print" },
  { id: "price-list-label-1117-black", category: "Labels", name: "11x17 labels black ink", unit: "sheet", price: 1.11, notes: "Page 9" },
  { id: "price-list-label-1218-black", category: "Labels", name: "12x18 labels black ink", unit: "sheet", price: 1.42, notes: "Page 19" },
  { id: "price-list-label-glossy-add", category: "Labels", name: "Glossy white label material add-on", unit: "sheet", price: 0.11, notes: "Page 9" },
  { id: "price-list-label-gold-silver-clear-add", category: "Labels", name: "Gold, silver, or clear label material add-on", unit: "sheet", price: 1.25, notes: "Page 9" },
  { id: "price-list-label-setup", category: "Labels", name: "First time label setup", unit: "job", price: 40, notes: "Page 9" },
  { id: "price-list-envelope-standard-black", category: "Envelopes", name: "#9/#10 regular envelope black", unit: "tiered", price: 43, notes: "Pages 11-12; interpolated by quantity" },
  { id: "price-list-envelope-window-black", category: "Envelopes", name: "#10 window envelope black", unit: "tiered", price: 43, notes: "Pages 11-12; interpolated by quantity" },
  { id: "price-list-envelope-6x9-booklet-black", category: "Envelopes", name: "6x9 booklet envelope black", unit: "tiered", price: 51, notes: "Pages 11-12; interpolated by quantity" },
  { id: "price-list-envelope-6x9-open-black", category: "Envelopes", name: "6x9 open end envelope black", unit: "tiered", price: 56, notes: "Pages 11-12; interpolated by quantity" },
  { id: "price-list-envelope-remittance-black", category: "Envelopes", name: "6 3/4 remittance envelope black", unit: "500", price: 165, notes: "Only 500 and 1000 were listed" },
  { id: "price-list-envelope-9x12-booklet-black", category: "Envelopes", name: "9x12 booklet envelope black", unit: "tiered", price: 60, notes: "Pages 11-12; interpolated by quantity" },
  { id: "price-list-envelope-9x12-catalog-black", category: "Envelopes", name: "9x12 catalog envelope black", unit: "tiered", price: 67, notes: "Pages 11-12; interpolated by quantity" },
  { id: "price-list-envelope-10x13-booklet-black", category: "Envelopes", name: "10x13 booklet envelope black", unit: "tiered", price: 69, notes: "Pages 11-12; interpolated by quantity" },
  { id: "price-list-envelope-10x13-catalog-black", category: "Envelopes", name: "10x13 catalog envelope black", unit: "tiered", price: 69, notes: "Pages 11-12; interpolated by quantity" },
  { id: "price-list-envelope-a8-black", category: "Envelopes", name: "A8 envelope black", unit: "tiered", price: 56, notes: "Pages 11-12; interpolated by quantity" },
  { id: "price-list-envelope-a9-black", category: "Envelopes", name: "A9 envelope black", unit: "tiered", price: 56, notes: "Pages 11-12; interpolated by quantity" },
  { id: "price-list-envelope-standard-color", category: "Envelopes", name: "#9/#10 regular envelope color", unit: "tiered", price: 95, notes: "Pages 13-14 through 3000; heavy coverage add 20%" },
  { id: "price-list-envelope-window-color", category: "Envelopes", name: "#10 window envelope color", unit: "tiered", price: 95, notes: "Pages 13-14 through 3000; heavy coverage add 20%" },
  { id: "price-list-envelope-6x9-color", category: "Envelopes", name: "6x9 booklet/open envelope color", unit: "tiered", price: 104, notes: "Pages 13-14 through 3000; heavy coverage add 20%" },
  { id: "price-list-envelope-9x12-color", category: "Envelopes", name: "9x12 booklet/catalog envelope color", unit: "tiered", price: 112, notes: "Pages 13-14 through 3000; heavy coverage add 20%" },
  { id: "price-list-envelope-10x13-color", category: "Envelopes", name: "10x13 booklet/catalog envelope color", unit: "tiered", price: 118, notes: "Pages 13-14 through 3000; heavy coverage add 20%" },
  { id: "price-list-envelope-a8-a9-color", category: "Envelopes", name: "A8/A9 envelope color", unit: "tiered", price: 110, notes: "Pages 13-14 through 3000; heavy coverage add 20%" },
  { id: "price-list-invite-a8", category: "Invitations", name: "A8 invitation 10.5x7.5", unit: "500", price: 498, notes: "1000 $652; add 100 $41; reorder +$20" },
  { id: "price-list-invite-a9-thin", category: "Invitations", name: "A9 thin invitation 11x8.5", unit: "500", price: 556, notes: "1000 $806; add 100 $61; reorder +$20" },
  { id: "price-list-invite-a9-thick", category: "Invitations", name: "A9 thick invitation 11x8.5", unit: "500", price: 578, notes: "1000 $849; add 100 $64; reorder +$20" },
  { id: "price-list-invite-a10-white", category: "Invitations", name: "A10 invitation white 11.5x9", unit: "500", price: 644, notes: "1000 $965; add 100 $78; reorder +$20" },
  { id: "price-list-invite-a10-antique", category: "Invitations", name: "A10 invitation antique white 11.5x9", unit: "500", price: 697, notes: "1000 $1069; add 100 $90; reorder +$20" },
  { id: "price-list-invite-oblong-princess", category: "Invitations", name: "Oblong princess thick add-on", unit: "1000", price: 138, notes: "Page 10" },
  { id: "price-list-invite-oblong-bleed", category: "Invitations", name: "Oblong bleed princess thick add-on", unit: "1000", price: 306, notes: "Page 10" },
  { id: "price-list-invite-grey-ink", category: "Invitations", name: "Grey ink add-on", unit: "1000", price: 31, notes: "Page 10" },
  { id: "price-list-laminate-3mil-8514", category: "Laminating", name: "3 mil laminate 8.5x14", unit: "tiered each", price: 4.75, notes: "Page 16" },
  { id: "price-list-laminate-3mil-1117", category: "Laminating", name: "3 mil laminate 11x17", unit: "tiered each", price: 5.25, notes: "Page 16" },
  { id: "price-list-laminate-3mil-1218", category: "Laminating", name: "3 mil laminate 12x18", unit: "tiered each", price: 5.25, notes: "Page 16" },
  { id: "price-list-laminate-5mil-8514", category: "Laminating", name: "5 mil laminate 8.5x14", unit: "tiered each", price: 5.5, notes: "Page 16" },
  { id: "price-list-laminate-5mil-1117", category: "Laminating", name: "5 mil laminate 11x17", unit: "tiered each", price: 6.25, notes: "Page 16" },
  { id: "price-list-laminate-5mil-1218", category: "Laminating", name: "5 mil laminate 12x18", unit: "tiered each", price: 6.25, notes: "Page 16" },
  { id: "price-list-receipt-book-color", category: "Receipt Books", name: "40 receipt books color", unit: "3 books", price: 101, notes: "6 $184; 9 $236; 12 $271; after 12 add $42 per 3 books" },
  { id: "price-list-receipt-book-50-bw", category: "Receipt Books", name: "50 receipt books black ink", unit: "3 books", price: 71, notes: "Up to 12 books same as 40 receipt books; after 12 add $24 per 3 books" },
  { id: "price-list-receipt-book-50-color", category: "Receipt Books", name: "50 receipt books color", unit: "3 books", price: 101, notes: "Up to 12 books same as 40 receipt books; after 12 add $51 per 3 books" },
  { id: "price-list-receipt-red-numbers", category: "Receipt Books", name: "Red receipt book numbering", unit: "job", price: 50, notes: "Page 17" },
  { id: "price-list-order-form-book", category: "Receipt Books", name: "Order form / books setup", unit: "job", price: 40, notes: "$0.07 per sheet plus copies" },
  { id: "price-list-stamp-1850", category: "Stamps", name: "Self ink stamp style 1850", unit: "each", price: 50, notes: "0.71x1.97 black/red" },
  { id: "price-list-stamp-2260", category: "Stamps", name: "Self ink stamp style 2260", unit: "each", price: 50, notes: "0.86x2.35 black/red" },
  { id: "price-list-stamp-2770", category: "Stamps", name: "Self ink stamp style 2770", unit: "each", price: 50, notes: "1.04x2.75 black" },
  { id: "price-list-stamp-3458", category: "Stamps", name: "Self ink stamp style 3458", unit: "each", price: 50, notes: "2.4x1.5 black" },
  { id: "price-list-stamp-4040", category: "Stamps", name: "Self ink stamp style 4040", unit: "each", price: 55, notes: "1.5x1.5 black/red" },
  { id: "price-list-stamp-4090", category: "Stamps", name: "Self ink stamp style 4090", unit: "each", price: 62, notes: "3.52x1.58 black/red" },
  { id: "price-list-die-cut-cardstock", category: "Die Cut", name: "Die cut card stock after 10 sheets", unit: "sheet", price: 1, notes: "Setup $150" },
  { id: "price-list-die-cut-labels", category: "Die Cut", name: "Die cut labels after 10 sheets", unit: "sheet", price: 0.6, notes: "Setup $150" },
  { id: "price-list-finishing-scoring", category: "Finishing", name: "Scoring", unit: "quote", price: 0, notes: "Listed finishing option; price from local machine rules" },
  { id: "price-list-finishing-perforation", category: "Finishing", name: "Perforation", unit: "quote", price: 0, notes: "Listed finishing option; price from local machine rules" },
  { id: "price-list-finishing-numbering", category: "Finishing", name: "Numbering", unit: "quote", price: 0, notes: "Listed finishing option; receipt red numbers +$50" },
  { id: "price-list-finishing-drilling", category: "Finishing", name: "Drilling / hole punch", unit: "quote", price: 0, notes: "Listed finishing option; price from local machine rules" }
];

export const priceListCatalogPrices: CatalogPrice[] = [
  { id: "price-list-service-minimum", category: "Service", name: "Minimum service charge", unit: "job", price: 20, notes: "Gross price list 7/1/25" },
  { id: "price-list-graphic-hour", category: "Graphics", name: "Graphic design", unit: "hour", price: 300, notes: "Minimum $50; logo design starts at $400" },
  { id: "price-list-cutting", category: "Cutting", name: "Cutting", unit: "actual cut", price: 2, notes: "Up to 500 paper sheets or 250 cards per pile" },
  { id: "price-list-padding-min", category: "Padding", name: "Padding minimum", unit: "up to 50 pads", price: 43, notes: "After 50 pads add $0.75 per pad" },
  { id: "price-list-fold-paper", category: "Folding", name: "Paper folding", unit: "first 1000", price: 28, notes: "After 1000 add $21 per thousand" },
  { id: "price-list-crease-card", category: "Folding", name: "Crease and fold card stock", unit: "first 1000", price: 39, notes: "After 1000 add $31 per thousand" },
  { id: "price-list-bc-color-1000", category: "Business Cards", name: "Full color business cards 2 sided", unit: "1000 cards", price: 178, notes: "Prices by requested business-card product, not parent sheet" },
  { id: "price-list-bc-black-1000", category: "Business Cards", name: "Black and white business cards 2 sided", unit: "1000 cards", price: 121, notes: "Gross price list 7/1/25" },
  { id: "price-list-copy-bw-letter", category: "Copies", name: "Black and white copies 8.5x11", unit: "tiered per copy", price: 0.27, notes: "Tiered down by quantity; priced by requested finished size" },
  { id: "price-list-copy-color-letter", category: "Copies", name: "Color copies 8.5x11", unit: "tiered per side", price: 1.22, notes: "Tiered down by quantity; 13x19 adds $0.05" },
  { id: "price-list-label-8511-color", category: "Labels", name: "8.5x11 color labels", unit: "tiered per sheet", price: 1.42, notes: "100-199 $1.30; 200-299 $1.13; 300+ $0.99" },
  { id: "price-list-envelope-10-black", category: "Envelopes", name: "#10 / #9 black envelope", unit: "100", price: 43, notes: "Tiered table through 10,000" },
  { id: "price-list-envelope-10-color", category: "Envelopes", name: "#10 / #9 color envelope", unit: "100", price: 95, notes: "Light coverage table through 3,000; heavy coverage add 20%" },
  { id: "price-list-invite-5x7", category: "Invitations", name: "Small postcard / invitation 4.25x6", unit: "500", price: 291, notes: "1,000 $330; add 100 $17" },
  { id: "price-list-invite-single-panel", category: "Invitations", name: "Single panel invitation 5.5x8.5", unit: "500", price: 521, notes: "1,000 $734; add 100 $51" },
  { id: "price-list-laminate-3mil-letter", category: "Laminating", name: "3 mil laminate 8.5x11", unit: "tiered each", price: 4, notes: "Drops to $2.00 each at 501+" },
  { id: "price-list-laminate-5mil-letter", category: "Laminating", name: "5 mil laminate 8.5x11", unit: "tiered each", price: 4.5, notes: "Drops to $2.50 each at 501+" },
  { id: "price-list-receipt-book-bw", category: "Receipt Books", name: "40 receipt books black ink", unit: "3 books", price: 71, notes: "6 books $126; 9 $148; 12 $169; after 12 add $21 per 3 books" },
  { id: "price-list-stamp-1438", category: "Stamps", name: "Self ink stamp style 1438", unit: "each", price: 50, notes: "0.54x1.49 black/red" },
  { id: "price-list-die-cut", category: "Die Cut", name: "Die cut setup", unit: "job", price: 150, notes: "After 10 sheets: card stock $1/sheet; labels $0.60/sheet" },
  { id: "price-list-simcha-bag-paper", category: "Simcha Bags", name: "Paper simcha bag color", unit: "50 bags", price: 59.5, notes: "Tiered through 500" },
  { id: "price-list-simcha-bag-plastic", category: "Simcha Bags", name: "Plastic simcha bag color", unit: "50 bags", price: 99.5, notes: "Tiered through 500" },
  ...priceBookCatalogAdditions
];

export function calculatePriceListEstimate(
  data: EstimateFormData,
  stock: PaperStock,
  imposition: ImpositionResult
): PriceListEstimate | undefined {
  const pricingData = autoPricingData(data, stock);
  return (
    priceBusinessCards(pricingData) ??
    priceInvitations(pricingData) ??
    priceEnvelopes(pricingData, stock) ??
    priceLabels(pricingData, stock, imposition) ??
    priceLaminating(pricingData) ??
    priceReceiptBooks(pricingData) ??
    priceSimchaBags(pricingData) ??
    priceCopies(pricingData)
  );
}

function priceBusinessCards(data: EstimateFormData): PriceListEstimate | undefined {
  if (!hasAny(data.title, ["business card", "business cards"])) return undefined;
  if (!isBusinessCardSize(data.pieceWidth, data.pieceHeight)) return undefined;

  const rows = isBlackOnly(data) ? businessCardRows.black : businessCardRows.color;
  const sideKey = data.sides === 2 || data.colorSpec.includes("/4") ? "two" : "one";
  const price = interpolatedFixedPrice(rows, data.quantity, sideKey);
  return productPrice(price, "Business card table");
}

function priceCopies(data: EstimateFormData): PriceListEstimate | undefined {
  if (hasAny(data.title, ["business card", "envelope", "label", "sticker", "invitation", "postcard"])) return undefined;
  if (!hasAny(data.title, ["copy", "copies", "flyer", "brochure", "letter", "sell sheet"])) return undefined;

  const size = copySizeKey(data.pieceWidth, data.pieceHeight);
  if (!size) return undefined;

  if (isBlackOnly(data)) {
    const rate = interpolatedRateFor(blackCopyRates[size], data.quantity);
    if (!rate) return undefined;
    return productPrice(rate * data.quantity, `Black copy table ${size}`);
  }

  const colorKey = size === "8.5x11" ? "8.5x11" : "wide";
  const rate = interpolatedRateFor(colorCopyRates[colorKey], data.quantity);
  if (!rate) return undefined;
  const sizeAdd = size === "13x19" ? 0.05 : 0;
  return productPrice((rate + sizeAdd) * data.quantity * data.sides, `Color copy table ${size}`);
}

function priceInvitations(data: EstimateFormData): PriceListEstimate | undefined {
  if (!hasAny(data.title, ["invitation", "invite", "postcard", "post card", "a-8", "a-9", "a-10"])) return undefined;

  const title = data.title.toLowerCase();
  const matched =
    invitationRows.find((row) => title.includes(row.key)) ??
    invitationRows.find((row) => isSameSize(data.pieceWidth, data.pieceHeight, row.width, row.height));
  if (!matched) {
    if (hasAny(title, ["small invitation", "small invite"])) {
      const additional = Math.max(0, Math.ceil((data.quantity - 400) / 100)) * 8;
      const secondSide = data.sides === 2 ? 16 : 0;
      return productPrice(44 + additional + secondSide, "Small invitation table");
    }
    return undefined;
  }

  const price =
    data.quantity <= 500
      ? matched.base500
      : data.quantity <= 1000
        ? interpolate(data.quantity, 500, matched.base500, 1000, matched.base1000)
        : matched.base1000 + ((data.quantity - 1000) / 100) * matched.add100;
  return productPrice(price, matched.label);
}

function priceEnvelopes(data: EstimateFormData, stock: PaperStock): PriceListEstimate | undefined {
  const haystack = `${data.title} ${stock.name}`.toLowerCase();
  if (!haystack.includes("envelope")) return undefined;

  const key = envelopeKey(haystack);
  const price = interpolatedFixedPrice(isBlackOnly(data) ? envelopeBlackRows : envelopeColorRows, data.quantity, key);
  if (!price) return undefined;
  const heavyCoverage = !isBlackOnly(data) && hasAny(haystack, ["heavy", "full coverage"]);
  return productPrice(price * (heavyCoverage ? 1.2 : 1), `Envelope table ${key}`);
}

function priceLabels(data: EstimateFormData, stock: PaperStock, imposition: ImpositionResult): PriceListEstimate | undefined {
  const haystack = `${data.title} ${stock.name}`.toLowerCase();
  if (!hasAny(haystack, ["label", "labels", "sticker", "stickers"])) return undefined;

  const size = labelSheetKey(stock.sheetWidth, stock.sheetHeight) ?? labelSheetKey(data.pieceWidth, data.pieceHeight);
  if (!size) return undefined;
  const rates = labelRates[size];
  const rate = interpolatedRateFor(isBlackOnly(data) ? rates.black : rates.color, imposition.sheetsNeeded);
  if (!rate) return undefined;
  let price = rate * imposition.sheetsNeeded;
  if (haystack.includes("glossy")) price += 0.11 * imposition.sheetsNeeded;
  if (hasAny(haystack, ["gold", "silver", "clear"])) price += 1.25 * imposition.sheetsNeeded;
  if (hasAny(haystack, ["first time", "setup"])) price += 40;
  return productPrice(price, `Label sheet table ${size}`);
}

function priceLaminating(data: EstimateFormData): PriceListEstimate | undefined {
  const haystack = `${data.title} ${data.bindery.join(" ")}`.toLowerCase();
  if (!haystack.includes("laminat")) return undefined;

  const size = copySizeKey(data.pieceWidth, data.pieceHeight);
  if (!size || size === "13x19") return undefined;
  const mil = haystack.includes("5") ? "5mil" : "3mil";
  const rates = laminatingRates[mil][size as keyof typeof laminatingRates[typeof mil]];
  if (!rates) return undefined;
  const rate = interpolatedBreakValue(laminatingBreaks, rates, data.quantity);
  return productPrice(rate * data.quantity, `${mil === "5mil" ? "5" : "3"} mil laminating table`);
}

function priceReceiptBooks(data: EstimateFormData): PriceListEstimate | undefined {
  const title = data.title.toLowerCase();
  if (!hasAny(title, ["receipt book", "receipt books", "order form", "order forms"])) return undefined;

  const color = !isBlackOnly(data);
  const baseRows = color
    ? [
        { quantity: 3, price: 101 },
        { quantity: 6, price: 184 },
        { quantity: 9, price: 236 },
        { quantity: 12, price: 271 }
      ]
    : [
        { quantity: 3, price: 71 },
        { quantity: 6, price: 126 },
        { quantity: 9, price: 148 },
        { quantity: 12, price: 169 }
      ];
  const is50Receipt = title.includes("50");
  const add = color ? (is50Receipt ? 51 : 42) : is50Receipt ? 24 : 21;
  const price = data.quantity <= 12 ? interpolatedBreakPrice(baseRows, data.quantity) : baseRows[3].price + ((data.quantity - 12) / 3) * add;
  return productPrice(price, "Receipt book table");
}

function priceSimchaBags(data: EstimateFormData): PriceListEstimate | undefined {
  const title = data.title.toLowerCase();
  if (!hasAny(title, ["simcha bag", "paper bag", "plastic bag"])) return undefined;

  const plastic = title.includes("plastic");
  const color = !isBlackOnly(data);
  const key = `${plastic ? "plastic" : "paper"}${color ? "Color" : "Black"}`;
  return productPrice(interpolatedFixedPrice(simchaBagRows, data.quantity, key), "Simcha bag table");
}

function autoPricingData(data: EstimateFormData, stock: PaperStock): EstimateFormData {
  if (!hasAny(data.title, ["business card", "business cards"]) || isBusinessCardSize(data.pieceWidth, data.pieceHeight)) {
    return data;
  }

  const inferredTitle = inferTitleFromFinishedSize(data, stock);
  return inferredTitle ? { ...data, title: inferredTitle } : data;
}

function inferTitleFromFinishedSize(data: EstimateFormData, stock: PaperStock) {
  const stockName = stock.name.toLowerCase();
  if (stockName.includes("envelope")) return "Envelope";
  if (hasAny(stockName, ["label", "pressure sensitive"])) return "Label sheet";
  if (copySizeKey(data.pieceWidth, data.pieceHeight)) return "Flyer";
  if (isSameSize(data.pieceWidth, data.pieceHeight, 5.5, 8.5)) return "Large postcard";
  if (isSameSize(data.pieceWidth, data.pieceHeight, 4.25, 6)) return "Small postcard";
  if (isSameSize(data.pieceWidth, data.pieceHeight, 10.5, 7.5)) return "A-8 invitation";
  if (isSameSize(data.pieceWidth, data.pieceHeight, 11, 8.5)) return "A-9 invitation";
  if (isSameSize(data.pieceWidth, data.pieceHeight, 11.5, 9)) return "A-10 invitation";
  return undefined;
}

function productPrice(value: number, notes: string): PriceListEstimate {
  const printing = roundMoney(Math.max(value, PRICE_LIST_MINIMUM));
  return {
    paper: 0,
    printing,
    finishing: 0,
    cutting: 0,
    notes
  };
}

function interpolatedFixedPrice(rows: FixedRow[], quantity: number, key: string) {
  const validRows = rows.filter((row) => typeof row[key] === "number" && row[key] > 0);
  if (!validRows.length) return 0;
  return interpolatedBreakPrice(
    validRows.map((row) => ({ quantity: row.quantity, price: row[key] })),
    quantity
  );
}

function interpolatedBreakPrice(rows: { quantity: number; price: number }[], quantity: number) {
  const sorted = [...rows].sort((a, b) => a.quantity - b.quantity);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (quantity <= first.quantity) return first.price;
  if (quantity >= last.quantity) return last.price * (quantity / last.quantity);
  const upperIndex = sorted.findIndex((row) => quantity <= row.quantity);
  const lower = sorted[upperIndex - 1];
  const upper = sorted[upperIndex];
  return interpolate(quantity, lower.quantity, lower.price, upper.quantity, upper.price);
}

function interpolatedRateFor(rates: TierRate[], quantity: number) {
  if (!rates.length) return undefined;
  const points = rates.map((tier) => ({ quantity: tier.min, rate: tier.rate }));
  return interpolatedBreakValue(
    points.map((point) => point.quantity),
    points.map((point) => point.rate),
    quantity
  );
}

function interpolatedBreakValue(breaks: number[], values: number[], quantity: number) {
  if (!breaks.length || !values.length) return 0;
  if (quantity <= breaks[0]) return values[0];
  const lastIndex = breaks.length - 1;
  if (quantity >= breaks[lastIndex]) return values[lastIndex];
  const upperIndex = breaks.findIndex((breakQuantity) => quantity <= breakQuantity);
  return interpolate(quantity, breaks[upperIndex - 1], values[upperIndex - 1], breaks[upperIndex], values[upperIndex]);
}

function interpolate(quantity: number, lowQuantity: number, lowPrice: number, highQuantity: number, highPrice: number) {
  const span = highQuantity - lowQuantity;
  if (span <= 0) return highPrice;
  const ratio = (quantity - lowQuantity) / span;
  return lowPrice + ratio * (highPrice - lowPrice);
}

function isBlackOnly(data: EstimateFormData) {
  const spec = data.colorSpec.toLowerCase();
  return spec.includes("black") || spec.includes("b&w") || spec.includes("1/0") || spec.includes("1/1");
}

function hasAny(value: string, needles: string[]) {
  const haystack = value.toLowerCase();
  return needles.some((needle) => haystack.includes(needle));
}

function normalizedSize(width: number, height: number) {
  return [Math.min(width, height), Math.max(width, height)] as const;
}

function isSameSize(width: number, height: number, targetWidth: number, targetHeight: number) {
  const [short, long] = normalizedSize(width, height);
  const [targetShort, targetLong] = normalizedSize(targetWidth, targetHeight);
  return Math.abs(short - targetShort) <= 0.15 && Math.abs(long - targetLong) <= 0.15;
}

function isBusinessCardSize(width: number, height: number) {
  return isSameSize(width, height, 3.5, 2);
}

function copySizeKey(width: number, height: number) {
  if (isSameSize(width, height, 8.5, 11)) return "8.5x11";
  if (isSameSize(width, height, 8.5, 14)) return "8.5x14";
  if (isSameSize(width, height, 11, 17)) return "11x17";
  if (isSameSize(width, height, 12, 18)) return "12x18";
  if (isSameSize(width, height, 13, 19)) return "13x19";
  return undefined;
}

function labelSheetKey(width: number, height: number) {
  if (isSameSize(width, height, 8.5, 11)) return "8.5x11";
  if (isSameSize(width, height, 11, 17)) return "11x17";
  if (isSameSize(width, height, 12, 18)) return "12x18";
  return undefined;
}

function envelopeKey(haystack: string) {
  if (haystack.includes("10x13") && haystack.includes("catalog")) return "catalog10x13";
  if (haystack.includes("10x13")) return "booklet10x13";
  if (haystack.includes("9x12") && haystack.includes("catalog")) return "catalog9x12";
  if (haystack.includes("9x12")) return "booklet9x12";
  if (haystack.includes("6x9") && haystack.includes("open")) return "open6x9";
  if (haystack.includes("6x9")) return "booklet6x9";
  if (haystack.includes("window")) return "window10";
  if (haystack.includes("remittance")) return "remittance";
  if (haystack.includes("a8")) return "a8";
  if (haystack.includes("a9")) return "a9";
  return "standard";
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
