/**
 * Combining two records that turned out to be the same customer.
 *
 * Imported data and a shop with three ways to create a customer means duplicates
 * happen. Once they exist, the customer's history is split: half their jobs
 * under one record, half under the other, and neither showing what they are
 * actually worth. Deleting the spare would take its jobs and invoices with it.
 *
 * Merging moves everything onto one record and archives the other. Archiving
 * rather than deleting is deliberate: a merge is easy to get backwards, and a
 * shop needs to be able to unwind one without having lost the record.
 *
 * The work is a pure function so the preview staff confirms and the change that
 * actually runs are computed by the same code — a preview that is calculated
 * separately from the operation is a preview that can lie.
 */

import type { Customer } from "./types";

/** Anything stored against a customer. */
interface CustomerLinked {
  customerId?: string;
  customerName?: string;
}

/** Every collection that points at a customer. */
export interface MergeCollections<
  TOrder extends CustomerLinked,
  TJob extends CustomerLinked,
  TQuote extends CustomerLinked,
  TInvoice extends CustomerLinked,
  TFile extends CustomerLinked,
  TThread extends CustomerLinked,
  TTicket extends CustomerLinked,
  TLog extends CustomerLinked
> {
  orders: TOrder[];
  jobs: TJob[];
  quotes: TQuote[];
  invoices: TInvoice[];
  files: TFile[];
  emailThreads: TThread[];
  emailIntakeTickets: TTicket[];
  emailLogs: TLog[];
}

export interface MergeCounts {
  orders: number;
  jobs: number;
  quotes: number;
  invoices: number;
  files: number;
  emailThreads: number;
  emailIntakeTickets: number;
  emailLogs: number;
  contacts: number;
  total: number;
}

/** What a merge would move, without moving it. */
export function previewCustomerMerge<
  A extends CustomerLinked, B extends CustomerLinked, C extends CustomerLinked, D extends CustomerLinked,
  E extends CustomerLinked, F extends CustomerLinked, G extends CustomerLinked, H extends CustomerLinked
>(
  collections: MergeCollections<A, B, C, D, E, F, G, H>,
  loser: Customer
): MergeCounts {
  const owned = (items: CustomerLinked[]) => items.filter((item) => item.customerId === loser.id).length;

  const counts = {
    orders: owned(collections.orders),
    jobs: owned(collections.jobs),
    quotes: owned(collections.quotes),
    invoices: owned(collections.invoices),
    files: owned(collections.files),
    emailThreads: owned(collections.emailThreads),
    emailIntakeTickets: owned(collections.emailIntakeTickets),
    emailLogs: owned(collections.emailLogs),
    // The duplicate's own address becomes a contact on the survivor, so no way
    // of reaching this customer is lost in the merge.
    contacts: (loser.contacts?.length ?? 0) + (loser.email ? 1 : 0)
  };

  return {
    ...counts,
    total: Object.values(counts).reduce((sum, value) => sum + value, 0)
  };
}

/** Repoint one collection's rows from the loser to the survivor. */
function repoint<T extends CustomerLinked>(items: T[], loserId: string, survivor: Customer): T[] {
  return items.map((item) =>
    item.customerId === loserId
      ? { ...item, customerId: survivor.id, ...(item.customerName !== undefined ? { customerName: survivor.name } : {}) }
      : item
  );
}

export interface MergeResult<
  A extends CustomerLinked, B extends CustomerLinked, C extends CustomerLinked, D extends CustomerLinked,
  E extends CustomerLinked, F extends CustomerLinked, G extends CustomerLinked, H extends CustomerLinked
> {
  collections: MergeCollections<A, B, C, D, E, F, G, H>;
  /** The survivor, carrying anything the duplicate knew that it did not. */
  survivor: Customer;
  /** The duplicate, archived rather than deleted. */
  loser: Customer;
  counts: MergeCounts;
}

/**
 * Move everything from `loser` onto `survivor`.
 *
 * The survivor keeps its own field values; the duplicate only fills in blanks.
 * Staff chose which record survives, and a merge that silently overwrote the
 * chosen record's phone number with the other one's would defeat that choice.
 */
export function mergeCustomers<
  A extends CustomerLinked, B extends CustomerLinked, C extends CustomerLinked, D extends CustomerLinked,
  E extends CustomerLinked, F extends CustomerLinked, G extends CustomerLinked, H extends CustomerLinked
>(
  collections: MergeCollections<A, B, C, D, E, F, G, H>,
  survivorInput: Customer,
  loser: Customer,
  now = new Date().toISOString()
): MergeResult<A, B, C, D, E, F, G, H> {
  const counts = previewCustomerMerge(collections, loser);

  // Keep every way of reaching this customer. The duplicate's main address
  // becomes a contact, so mail sent to it still matches after the merge.
  const existingEmails = new Set(
    [survivorInput.email, ...(survivorInput.contacts ?? []).map((contact) => contact.email)]
      .filter(Boolean)
      .map((email) => email!.toLowerCase())
  );
  const carriedContacts = [
    ...(loser.email && !existingEmails.has(loser.email.toLowerCase())
      ? [{
          id: `contact-merged-${loser.id}`,
          name: loser.contact || loser.name,
          email: loser.email,
          phone: loser.phone || undefined,
          department: `Merged from ${loser.name}`
        }]
      : []),
    ...(loser.contacts ?? []).filter((contact) => !existingEmails.has((contact.email ?? "").toLowerCase()))
  ];

  const survivor: Customer = {
    ...survivorInput,
    // Blanks only: the survivor's own values win.
    contact: survivorInput.contact || loser.contact,
    phone: survivorInput.phone || loser.phone,
    address: survivorInput.address || loser.address,
    city: survivorInput.city || loser.city,
    state: survivorInput.state || loser.state,
    zip: survivorInput.zip || loser.zip,
    // Money is summed, not chosen: both records represent real business done.
    totalSpend: (survivorInput.totalSpend ?? 0) + (loser.totalSpend ?? 0),
    openBalance: (survivorInput.openBalance ?? 0) + (loser.openBalance ?? 0),
    // The later of the two last orders is the customer's real last order.
    lastOrder: [survivorInput.lastOrder, loser.lastOrder].filter(Boolean).sort().at(-1) ?? survivorInput.lastOrder,
    contacts: [...(survivorInput.contacts ?? []), ...carriedContacts]
  };

  return {
    collections: {
      orders: repoint(collections.orders, loser.id, survivor),
      jobs: repoint(collections.jobs, loser.id, survivor),
      quotes: repoint(collections.quotes, loser.id, survivor),
      invoices: repoint(collections.invoices, loser.id, survivor),
      files: repoint(collections.files, loser.id, survivor),
      emailThreads: repoint(collections.emailThreads, loser.id, survivor),
      emailIntakeTickets: repoint(collections.emailIntakeTickets, loser.id, survivor),
      emailLogs: repoint(collections.emailLogs, loser.id, survivor)
    },
    survivor,
    loser: {
      ...loser,
      archived: true,
      // Recorded on the record itself, so a merge can be traced later without
      // depending on an activity log that may have been trimmed.
      importedFrom: `Merged into ${survivor.name} on ${now.slice(0, 10)}`
    },
    counts
  };
}
